import json
import time
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional
import re

# Endpoints
BITHUMB_INOUT_URL = "https://gw.bithumb.com/exchange/v1/coin-inout/info?_=1763224764210&retry=0"
BITHUMB_TICKER_USDT_URL = "https://api.bithumb.com/public/ticker/ALL_USDT"
BITHUMB_TICKER_KRW_URL = "https://api.bithumb.com/public/ticker/ALL_KRW"
BITHUMB_ORDERBOOK_USDT_URL = "https://api.bithumb.com/public/orderbook/ALL_USDT?count=1"
BITHUMB_ORDERBOOK_KRW_URL = "https://api.bithumb.com/public/orderbook/ALL_KRW?count=1"
GATEIO_FUTURES_TICKER_URL = "https://api.gateio.ws/api/v4/futures/usdt/tickers"
USER_AGENT = "Mozilla/5.0 (Codex Helper)"
DEFAULT_CAPITAL_USDT = 2000.0
BITHUMB_TAKER = 0.0004      # 0.04%
GATE_SPOT_TAKER = 0.002     # 0.20%
GATE_FUT_TAKER = 0.0006     # 0.06% per side (approx., taker). Assume open+close => x2 applied below.


def fetch_json(url: str) -> Any:
    req = urllib.request.Request(
        url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.load(resp)


def load_bithumb_inout() -> Dict[str, Dict[str, Any]]:
    """Returns symbol -> {deposit: bool, withdraw_fee: float|None, withdraw_min: float|None}."""
    payload = fetch_json(BITHUMB_INOUT_URL)
    if payload.get("code") != "common.success.00001":
        raise RuntimeError(f"Bithumb in/out API error: {payload}")
    result = {}
    for coin in payload.get("data", []):
        sym = coin.get("coinSymbol")
        if not sym:
            continue
        networks = coin.get("networkInfoList", [])
        deposit = any(n.get("isDepositAvailable") for n in networks)
        main = None
        for n in networks:
            if n.get("isMainNetwork"):
                main = n
                break
        if main is None and networks:
            main = networks[0]
        withdraw_fee = None
        withdraw_min = None
        try:
            if main and main.get("withdrawFeeQuantity") not in (None, ""):
                withdraw_fee = float(main["withdrawFeeQuantity"])
            if main and main.get("withdrawMinimumQuantity") not in (None, ""):
                withdraw_min = float(main["withdrawMinimumQuantity"])
        except (ValueError, TypeError):
            pass
        result[sym.upper()] = {
            "deposit": deposit,
            "withdraw_fee": withdraw_fee,
            "withdraw_min": withdraw_min,
        }
    return result


def load_bithumb_orderbook_prices(url: str) -> Dict[str, float]:
    """Get best ask from aggregated orderbook (ALL_* endpoint)."""
    payload = fetch_json(url).get("data", {})
    prices: Dict[str, float] = {}
    for sym, entry in payload.items():
        if sym in {"timestamp", "payment_currency"}:
            continue
        try:
            asks = entry.get("asks") or []
            if not asks:
                continue
            price = float(asks[0]["price"])
        except (KeyError, ValueError, TypeError):
            continue
        prices[sym.upper()] = price
    return prices


def load_bithumb_prices_usdt() -> Dict[str, float]:
    """USDT prices from Bithumb USDT orderbook best-ask; fallback to ticker sell_price/closing_price."""
    prices = load_bithumb_orderbook_prices(BITHUMB_ORDERBOOK_USDT_URL)
    if prices:
        return prices
    payload = fetch_json(BITHUMB_TICKER_USDT_URL)
    data = payload.get("data", {})
    for sym, info in data.items():
        if sym.upper() == "DATE":
            continue
        try:
            price = float(info.get("sell_price") or info.get("closing_price"))
        except (KeyError, ValueError, TypeError):
            continue
        prices[sym.upper()] = price
    return prices


def load_bithumb_prices_krw() -> Dict[str, float]:
    """KRW prices from Bithumb KRW orderbook best-ask; fallback to ticker sell_price/closing_price."""
    prices = load_bithumb_orderbook_prices(BITHUMB_ORDERBOOK_KRW_URL)
    if prices:
        return prices
    payload = fetch_json(BITHUMB_TICKER_KRW_URL)
    data = payload.get("data", {})
    for sym, info in data.items():
        if sym.upper() == "DATE":
            continue
        try:
            price = float(info.get("sell_price") or info.get("closing_price"))
        except (KeyError, ValueError, TypeError):
            continue
        prices[sym.upper()] = price
    return prices


def load_gateio_futures_prices() -> Dict[str, float]:
    """USDT-margined futures last prices. Returns symbol -> last_price_usdt."""
    payload = fetch_json(GATEIO_FUTURES_TICKER_URL)
    prices: Dict[str, float] = {}
    for item in payload:
        contract = item.get("contract") or ""
        if not contract.endswith("_USDT"):
            continue
        symbol = contract[:-5].upper()  # strip _USDT
        try:
            last_price = float(item["last"])
        except (KeyError, ValueError, TypeError):
            continue
        prices[symbol] = last_price
    return prices


def load_gateio_spot_bids() -> Dict[str, float]:
    """Spot best bids for USDT pairs."""
    payload = fetch_json("https://api.gateio.ws/api/v4/spot/tickers?limit=1000")
    bids: Dict[str, float] = {}
    for item in payload:
        pair = item.get("currency_pair") or ""
        if not pair.endswith("_USDT"):
            continue
        sym = pair.split("_")[0].upper()
        try:
            bid = float(item.get("highest_bid"))
        except (ValueError, TypeError):
            continue
        bids[sym] = bid
    return bids


def fetch_usdkrw_google() -> Optional[float]:
    """
    Rough USD/KRW rate scraped from Google Finance.
    Falls back to None if parsing fails.
    """
    url = "https://www.google.com/finance/quote/USD-KRW"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=10) as resp:
            html = resp.read().decode("utf-8", errors="ignore")
        m = re.search(r'data-last-price="([0-9.,]+)"', html)
        if not m:
            return None
        val = m.group(1).replace(",", "")
        return float(val)
    except Exception:
        return None


def compute_premiums(
    bt_info: Dict[str, Dict[str, Any]],
    bithumb_price_usdt: Dict[str, float],
    gateio_spot_bid: Dict[str, float],
    gateio_futures: Dict[str, float],
    capital_usdt: float = DEFAULT_CAPITAL_USDT,
    stable_kimp_pct: float = 0.0,
) -> List[Dict[str, Any]]:
    """Compute per-coin delta using Bithumb buy (USDT) vs Gate spot bid, with withdraw fee impact."""
    results: List[Dict[str, Any]] = []
    stable_skip = {"USDT", "USDC", "USD1"}
    symbols = sorted(
        set(bt_info.keys()) & set(bithumb_price_usdt.keys()) & set(gateio_spot_bid.keys()) & set(gateio_futures.keys())
    )
    for sym in symbols:
        if sym.upper() in stable_skip:
            continue
        meta = bt_info[sym]
        if not meta.get("deposit", False):
            continue
        bh_buy = float(bithumb_price_usdt[sym])
        gate_bid = float(gateio_spot_bid[sym])
        fut_price = float(gateio_futures[sym])
        if gate_bid <= 0 or bh_buy <= 0 or fut_price <= 0:
            continue
        w_fee = meta.get("withdraw_fee") or 0.0  # coin units
        # 빗썸 매수 시 테이커 수수료 반영: cost = price * qty * (1 + fee) = capital_usdt
        units = capital_usdt / (bh_buy * (1 + BITHUMB_TAKER))
        net_units = max(units - w_fee, 0.0)
        spot_gross = net_units * gate_bid
        spot_fee = spot_gross * GATE_SPOT_TAKER
        revenue_after_spot = spot_gross - spot_fee
        fut_fee = net_units * fut_price * GATE_FUT_TAKER * 2  # open+close 가정
        revenue = revenue_after_spot - fut_fee
        profit_abs = revenue - capital_usdt
        profit_pct = (profit_abs / capital_usdt * 100) if capital_usdt > 0 else 0.0
        fut_gap_pct = (fut_price / gate_bid - 1) * 100
        total_revenue = revenue * (1 + stable_kimp_pct)
        total_profit_abs = total_revenue - capital_usdt
        total_profit_pct = (total_profit_abs / capital_usdt * 100) if capital_usdt > 0 else 0.0
        results.append(
            {
                "symbol": sym,
                "bithumb_buy_usdt": bh_buy,
                "gate_spot_bid": gate_bid,
                "gate_futures": fut_price,
                "withdraw_fee": w_fee,
                "units": units,
                "net_units": net_units,
                "revenue_usdt": revenue,
                "profit_usdt": profit_abs,
                "profit_pct": profit_pct,
                "futures_gap_pct": fut_gap_pct,
                "stable_kimp_pct": stable_kimp_pct * 100.0,
                "total_profit_usdt": total_profit_abs,
                "total_profit_pct": total_profit_pct,
            }
        )
    results.sort(key=lambda x: x["total_profit_pct"], reverse=True)
    return results


def compute_stable_premium(
    stable_symbol: str,
    bithumb_krw: Dict[str, float],
    usdkrw: Optional[float],
) -> Optional[Dict[str, Any]]:
    if usdkrw is None or usdkrw <= 0:
        return None
    price = bithumb_krw.get(stable_symbol)
    if price is None:
        return None
    premium = (price / usdkrw - 1) * 100
    return {
        "symbol": stable_symbol,
        "bithumb_price_krw": price,
        "usd_krw": usdkrw,
        "premium_pct": premium,
    }


def main() -> None:
    while True:
        try:
            bt_info = load_bithumb_inout()
            bithumb_usdt = load_bithumb_prices_usdt()
            bithumb_krw = load_bithumb_prices_krw()
            gateio_futures = load_gateio_futures_prices()
            gateio_spot = load_gateio_spot_bids()
            usdkrw_fx = fetch_usdkrw_google()
            # Use only external FX for KRW→USDT 환산 (bithumb USDT/KRW는 김프 포함이므로 사용하지 않음)
            effective_usdkrw = usdkrw_fx
            if effective_usdkrw is None or effective_usdkrw <= 0:
                raise RuntimeError("Failed to fetch external USD/KRW FX; aborting cycle.")
            bithumb_price_usdt = dict(bithumb_usdt)
            if effective_usdkrw and effective_usdkrw > 0:
                for sym, krw_price in bithumb_krw.items():
                    if sym.upper() == "USDT":
                        continue
                    if sym not in bithumb_price_usdt:
                        bithumb_price_usdt[sym] = krw_price / effective_usdkrw

            stable_kimp_pct = 0.0
            if "USDT" in bithumb_krw and effective_usdkrw:
                stable_kimp_pct = (bithumb_krw["USDT"] / effective_usdkrw) - 1

            premiums = compute_premiums(
                bt_info,
                bithumb_price_usdt,
                gateio_spot,
                gateio_futures,
                capital_usdt=DEFAULT_CAPITAL_USDT,
                stable_kimp_pct=stable_kimp_pct,
            )
        except Exception as exc:
            print(f"[{datetime.now().isoformat()}] Error: {exc}")
            time.sleep(10)
            continue

        print("=" * 80)
        # Stablecoin premium vs FX USD/KRW
        stable_syms = ["USDT", "USDC", "USD1"]
        stable_rows = []
        for s in stable_syms:
            row = compute_stable_premium(s, bithumb_krw, usdkrw_fx)
            if row:
                stable_rows.append(row)

        print(f"{datetime.now().isoformat()} | entries={len(premiums)} | market=Bithumb(USDT basis) vs Gate.io futures/spot USDT | capital_usdt={DEFAULT_CAPITAL_USDT} | FX(USD/KRW, external)={usdkrw_fx} | stable_kimp_pct={(stable_kimp_pct*100):.2f}")
        if stable_rows:
            print("Stablecoin premium vs FX:")
            print(f"{'SYM':8} {'BITHUMB_KRW':>14} {'USD/KRW':>10} {'PREMIUM%':>10}")
            for r in stable_rows:
                print(
                    f"{r['symbol']:8} "
                    f"{r['bithumb_price_krw']:14.2f} "
                    f"{r['usd_krw']:10.2f} "
                    f"{r['premium_pct']:10.2f}"
                )

        header = f"{'SYM':8} {'BH_BUY':>12} {'GT_SPOT':>12} {'GT_FUT':>12} {'WITHDRAW':>10} {'NET_USDT':>12} {'PROFIT_USDT':>12} {'PROFIT%':>9} {'FUT_GAP%':>9}"
        profitable = [p for p in premiums if p["total_profit_usdt"] > 0]
        unprofitable = [p for p in premiums if p["total_profit_usdt"] <= 0]

        print("Profitable (after Gate 현물 매도 + USDT 김프 적용):")
        print(header)
        for item in profitable:
            print(
                f"{item['symbol'][:8]:8} "
                f"{item['bithumb_buy_usdt']:12.8f} "
                f"{item['gate_spot_bid']:12.8f} "
                f"{item['gate_futures']:12.8f} "
                f"{item['withdraw_fee']:10.4f} "
                f"{item['revenue_usdt']:12.8f} "
                f"{item['total_profit_usdt']:12.8f} "
                f"{item['total_profit_pct']:9.2f} "
                f"{item['futures_gap_pct']:9.2f}"
            )

        print("\nNot profitable (after Gate 현물 매도 + USDT 김프 적용):")
        print(header)
        for item in unprofitable:
            print(
                f"{item['symbol'][:8]:8} "
                f"{item['bithumb_buy_usdt']:12.8f} "
                f"{item['gate_spot_bid']:12.8f} "
                f"{item['gate_futures']:12.8f} "
                f"{item['withdraw_fee']:10.4f} "
                f"{item['revenue_usdt']:12.8f} "
                f"{item['total_profit_usdt']:12.8f} "
                f"{item['total_profit_pct']:9.2f} "
                f"{item['futures_gap_pct']:9.2f}"
            )
        time.sleep(10)


if __name__ == "__main__":
    main()
