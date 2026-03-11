import hashlib
import hmac
import json
import time
import urllib.parse
import urllib.request
from typing import Any, Dict, Optional

import config

# Endpoints (public)
BITHUMB_INOUT_URL = "https://gw.bithumb.com/exchange/v1/coin-inout/info?_=1763224764210&retry=0"
BITHUMB_ORDERBOOK_KRW_URL = "https://api.bithumb.com/public/orderbook/ALL_KRW?count=1"
GATE_SPOT_TICKERS = "https://api.gateio.ws/api/v4/spot/tickers?limit=1000"
GATE_FUT_TICKERS = "https://api.gateio.ws/api/v4/futures/usdt/tickers"
GATE_SPOT_CURRENCIES = "https://api.gateio.ws/api/v4/spot/currencies"
GOOGLE_FX_URL = "https://www.google.com/finance/quote/USD-KRW"
USER_AGENT = "Mozilla/5.0 (Codex Helper)"
GATE_BASE_URL = "https://api.gateio.ws"
MAX_KIMP_PREMIUM = 0.005   # 빗썸 현물 가격이 Gate 현물보다 0.5% 초과로 비싸면 스킵
MAX_BASIS_GAP = 0.002     # Gate 선물-현물 괴리 허용치 (0.2%)
MIN_TOTAL_PCT = 1.0       # 총 기대 수익률(%) 최소 1% 이상만 진입
MIN_RELATIVE_KIMP = -0.005 # 코인 김프가 USDT 김프보다 최소 -0.5% 이상 낮아야 함


# --- Helpers ---
def normalize_chain(name: Optional[str]) -> str:
    """
    Normalize network/chain labels for loose matching between exchanges.
    - Lowercase, strip space/hyphen/underscore
    - Simple aliases: eth/ethereum/erc -> erc20, trx/tron -> trc20, bep20 -> bsc,
      arb/arbitrum/arbevm -> arbitrumone.
    """
    if not name:
        return ""
    import re

    key = re.sub(r"[\s\-_]", "", str(name)).lower()
    aliases = {
        "eth": "erc20",
        "ethereum": "erc20",
        "erc": "erc20",
        "trx": "trc20",
        "tron": "trc20",
        "bep20": "bsc",
        "arb": "arbitrumone",
        "arbitrum": "arbitrumone",
        "arbevm": "arbitrumone",
    }
    return aliases.get(key, key)


# --- HTTP helpers ---
def fetch_json(url: str) -> Any:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.load(resp)


def fetch_fx_usdkrw() -> Optional[float]:
    try:
        req = urllib.request.Request(GOOGLE_FX_URL, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=10) as resp:
            html = resp.read().decode("utf-8", errors="ignore")
        import re
        m = re.search(r'data-last-price="([0-9.,]+)"', html)
        if not m:
            return None
        return float(m.group(1).replace(",", ""))
    except Exception:
        return None


# --- Data loaders ---
def load_bithumb_inout() -> Dict[str, Dict[str, Any]]:
    payload = fetch_json(BITHUMB_INOUT_URL)
    if payload.get("code") != "common.success.00001":
        raise RuntimeError(f"Bithumb in/out API error: {payload}")
    result = {}
    for coin in payload.get("data", []):
        sym = coin.get("coinSymbol")
        if not sym:
            continue
        nets = coin.get("networkInfoList", [])
        deposit = any(n.get("isDepositAvailable") for n in nets)
        withdraw = any(n.get("isWithdrawAvailable") for n in nets)
        price_krw = None
        try:
            if coin.get("coinKrwSise") not in (None, "", "0"):
                price_krw = float(coin.get("coinKrwSise"))
        except Exception:
            price_krw = None
        main = None
        for n in nets:
            if n.get("isMainNetwork"):
                main = n
                break
        if main is None and nets:
            main = nets[0]
        fee = None
        if main and main.get("withdrawFeeQuantity") not in (None, ""):
            try:
                fee = float(main["withdrawFeeQuantity"])
            except Exception:
                fee = None
        networks = []
        for n in nets:
            fee_krw = None
            try:
                if price_krw and n.get("withdrawFeeQuantity") not in (None, ""):
                    fee_krw = float(n["withdrawFeeQuantity"]) * price_krw
            except Exception:
                fee_krw = None
            networks.append(
                {
                    "name": n.get("networkName"),
                    "normalized": normalize_chain(n.get("networkName")),
                    "is_main": n.get("isMainNetwork", False),
                    "deposit": n.get("isDepositAvailable", False),
                    "withdraw": n.get("isWithdrawAvailable", False),
                    "withdraw_fee": n.get("withdrawFeeQuantity"),
                    "withdraw_fee_krw": fee_krw,
                    "withdraw_min": n.get("withdrawMinimumQuantity"),
                }
            )
        fee_krw_main = None
        try:
            if price_krw and fee is not None:
                fee_krw_main = fee * price_krw
        except Exception:
            fee_krw_main = None
        result[sym.upper()] = {
            "deposit": deposit,
            "withdraw": withdraw,
            "withdraw_fee": fee or 0.0,
            "withdraw_fee_krw": fee_krw_main,
            "price_krw": price_krw,
            "networks": networks,
        }
    return result


def build_kimp_table(
    bt_info: Dict[str, Dict[str, Any]],
    bt_krw: Dict[str, float],
    gt_spot: Dict[str, float],
    gt_status: Dict[str, Dict[str, Any]],
    fx: float,
) -> Dict[str, Dict[str, Any]]:
    table: Dict[str, Dict[str, Any]] = {}
    if not fx or fx <= 0:
        return table
    syms = set(bt_info) & set(bt_krw) & set(gt_spot) & set(gt_status)
    for sym in syms:
        meta = bt_info[sym]
        gate_meta = gt_status.get(sym, {})
        # 체인 일치 + 빗썸 출금 + Gate 입금 가능 필수
        if not (meta.get("withdraw") and gate_meta.get("deposit") and has_common_chain(meta, gate_meta)):
            continue
        bh_krw = bt_krw[sym]
        gt = gt_spot[sym]
        if bh_krw <= 0 or gt <= 0:
            continue
        bh_usdt = bh_krw / fx
        kimp = (bh_usdt / gt) - 1  # 빗썸 환산 USDT vs Gate 현물 USDT
        table[sym] = {
            "bh_krw": bh_krw,
            "bh_usdt": bh_usdt,
            "gt_usdt": gt,
            "kimp_pct": kimp * 100,
        }
    return table


def load_bithumb_orderbook(url: str) -> Dict[str, float]:
    payload = fetch_json(url).get("data", {})
    prices = {}
    for sym, entry in payload.items():
        if sym in {"timestamp", "payment_currency"}:
            continue
        asks = entry.get("asks") or []
        if not asks:
            continue
        try:
            price = float(asks[0]["price"])
        except Exception:
            continue
        prices[sym.upper()] = price
    return prices


def load_gate_spot_bids() -> Dict[str, float]:
    data = fetch_json(GATE_SPOT_TICKERS)
    bids = {}
    for item in data:
        pair = item.get("currency_pair") or ""
        if not pair.endswith("_USDT"):
            continue
        sym = pair.split("_")[0].upper()
        try:
            bid = float(item.get("highest_bid"))
        except Exception:
            continue
        bids[sym] = bid
    return bids


def load_gate_status() -> Dict[str, Dict[str, Any]]:
    data = fetch_json(GATE_SPOT_CURRENCIES)
    status: Dict[str, Dict[str, Any]] = {}
    for item in data:
        sym = (item.get("currency") or "").upper()
        if not sym:
            continue
        deposit = not item.get("deposit_disabled", False)
        chain = item.get("chain")
        status[sym] = status.get(sym, {"deposit": False, "networks": []})
        status_entry = status[sym]
        status_entry["deposit"] = status_entry["deposit"] or deposit
        status_entry["networks"].append(
            {"chain": chain, "normalized": normalize_chain(chain), "deposit": deposit}
        )
    return status


def has_common_chain(bt_meta: Dict[str, Any], gate_meta: Dict[str, Any]) -> bool:
    """체인명이 일치하는 네트워크가 있는지 확인."""
    bt_nets = bt_meta.get("networks") or []
    gt_nets = gate_meta.get("networks") or []
    for bn in bt_nets:
        if not (bn.get("withdraw") and bn.get("normalized")):
            continue
        for gn in gt_nets:
            if gn.get("deposit") and gn.get("normalized") and gn["normalized"] == bn["normalized"]:
                return True
    return False


def load_gate_futures_last() -> Dict[str, float]:
    data = fetch_json(GATE_FUT_TICKERS)
    last = {}
    for item in data:
        contract = item.get("contract") or ""
        if not contract.endswith("_USDT"):
            continue
        sym = contract[:-5].upper()
        try:
            last_price = float(item["last"])
        except Exception:
            continue
        last[sym] = last_price
    return last


# --- Core computation ---
def compute_best_route(
    bt_info: Dict[str, Dict[str, Any]],
    bt_krw: Dict[str, float],
    gt_spot: Dict[str, float],
    gt_fut: Dict[str, float],
    gt_status: Dict[str, Dict[str, Any]],
    fx: float,
) -> Optional[Dict[str, Any]]:
    if not fx or fx <= 0:
        return None

    # KRW 마켓 기준 가격을 USD/KRW 환율로 환산
    bt_usdt_all: Dict[str, float] = {}
    for sym, krw_price in bt_krw.items():
        if krw_price and krw_price > 0:
            bt_usdt_all[sym] = krw_price / fx

    stable_kimp = (bt_krw.get("USDT", 0) / fx) - 1 if fx else 0.0
    effective_capital = min(config.MAX_TOTAL_USDT, config.CAPITAL_USDT)
    best = None
    syms = set(bt_info) & set(bt_usdt_all) & set(gt_spot) & set(gt_fut) & set(gt_status)
    for sym in syms:
        if sym in {"USDT", "USDC", "USD1"}:
            continue
        meta = bt_info[sym]
        gate_meta = gt_status.get(sym, {})
        if not (meta.get("deposit") and meta.get("withdraw") and gate_meta.get("deposit")):
            continue
        if not has_common_chain(meta, gate_meta):
            continue
        bh = bt_usdt_all[sym]        # 빗썸 KRW 가격을 환산한 USDT 기준 매수가
        gb = gt_spot[sym]            # Gate 현물 매도가(입금 후 매도 대상)
        gf = gt_fut[sym]             # Gate 선물 가격(숏)
        if bh <= 0 or gb <= 0 or gf <= 0:
            continue
        # 김프: 빗썸 환산 가격이 Gate 현물보다 0.5% 초과로 비싸면 스킵
        price_kimp = (bh / gb) - 1
        # USDT 김프 대비 상대 김프 (음수/낮은 쪽만 허용)
        relative_kimp = price_kimp - stable_kimp
        if relative_kimp > MIN_RELATIVE_KIMP:
            continue
        # 베이시스: Gate 선물-현물 괴리가 허용치 넘으면 스킵
        basis_gap = abs(gf / gb - 1)
        if basis_gap > MAX_BASIS_GAP:
            continue
        fee = meta.get("withdraw_fee") or 0.0
        qty = effective_capital / (bh * (1 + config.BITHUMB_TAKER))
        net_qty = max(qty - fee, 0.0)
        spot_gross = net_qty * gb
        spot_fee = spot_gross * config.GATE_SPOT_TAKER
        fut_fee = net_qty * gf * config.GATE_FUT_TAKER * 2
        revenue = spot_gross - spot_fee - fut_fee
        profit = revenue - effective_capital
        total_revenue = revenue * (1 + stable_kimp)
        total_profit = total_revenue - effective_capital
        total_pct = total_profit / effective_capital * 100
        row = {
            "symbol": sym,
            "bh_buy": bh,
            "gt_spot": gb,
            "gt_fut": gf,
            "withdraw_fee": fee,
            "qty": qty,
            "net_qty": net_qty,
            "revenue": revenue,
            "profit": profit,
            "capital_usdt": effective_capital,
            "stable_kimp": stable_kimp * 100,
            "total_profit": total_profit,
            "total_pct": total_pct,
            "price_kimp_pct": price_kimp * 100,
            "basis_gap_pct": basis_gap * 100,
        }
        if total_pct < MIN_TOTAL_PCT:
            continue
        if best is None or row["total_pct"] > best["total_pct"]:
            best = row
    return best


def confirm_before_execute(sym: str, bt_info: Dict[str, Any], gt_status: Dict[str, Any], best: Dict[str, Any]) -> bool:
    """Ask user for confirmation with deposit/withdraw info before live execution."""
    print("=== 실행 전 확인 ===")
    print(f"심볼: {sym}")
    print(f"빗썸 입금: {bt_info.get('deposit')} | 출금: {bt_info.get('withdraw')} | 출금 수수료: {bt_info.get('withdraw_fee')}")
    print(f"Gate 입금: {gt_status.get('deposit')} | 출금: {gt_status.get('withdraw')}")
    print(f"계산된 매수 수량(qty): {best.get('qty')}, 출금 후 수령(net_qty): {best.get('net_qty')}")
    ans = input("위 조건으로 진행할까요? (y/N): ").strip().lower()
    return ans in ("y", "yes")


# --- Authenticated trading helpers ---
def bithumb_signed_post(path: str, params: Dict[str, Any]) -> Dict[str, Any]:
    if not config.BITHUMB_API_KEY or not config.BITHUMB_API_SECRET:
        raise RuntimeError("Bithumb API keys are missing.")
    nonce = str(int(time.time() * 1000))
    qs = urllib.parse.urlencode(params)
    data = path + chr(0) + qs + chr(0) + nonce
    sign = hmac.new(config.BITHUMB_API_SECRET.encode(), data.encode(), hashlib.sha512).hexdigest()
    headers = {
        "Api-Key": config.BITHUMB_API_KEY,
        "Api-Sign": sign,
        "Api-Nonce": nonce,
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
    }
    req = urllib.request.Request(
        "https://api.bithumb.com" + path, data=qs.encode(), headers=headers, method="POST"
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        result = json.load(resp)
    status = str(result.get("status", ""))
    if status not in {"0000", "0", "success"}:
        raise RuntimeError(f"Bithumb API error for {path}: {result}")
    return result


def bithumb_place_buy(symbol: str, qty: float, price: float) -> Dict[str, Any]:
    path = "/trade/market_buy"
    params = {
        "order_currency": symbol,
        "payment_currency": "USDT",
        "units": qty,
        # 시장가 매수는 price 없이 units 기준. endpoint 필드는 Bithumb 시그니처에 사용.
        "endpoint": path,
    }
    if price > 0:
        params["price"] = price
    return bithumb_signed_post(path, params)


def bithumb_request_withdraw(symbol: str, qty: float, network: str = config.WITHDRAW_NETWORK) -> Dict[str, Any]:
    target = config.WITHDRAW_TARGETS.get(symbol.upper())
    if not target or not target.get("address"):
        raise RuntimeError(f"No withdrawal target configured for {symbol}")
    path = "/trade/withdrawal"
    params = {
        "currency": symbol,
        "units": qty,
        "address": target["address"],
        "endpoint": path,
    }
    if target.get("tag"):
        params["destination"] = target["tag"]
    if network:
        params["network"] = network
    if target.get("network"):
        params["network"] = target["network"]
    return bithumb_signed_post(path, params)


def gate_signed_post(path: str, body: Dict[str, Any]) -> Dict[str, Any]:
    if not config.GATE_API_KEY or not config.GATE_API_SECRET:
        raise RuntimeError("Gate API keys are missing.")
    ts = str(int(time.time()))
    body_str = json.dumps(body)
    payload = "\n".join([ts, "POST", path, "", body_str])
    sign = hmac.new(config.GATE_API_SECRET.encode(), payload.encode(), hashlib.sha512).hexdigest()
    req = urllib.request.Request(
        GATE_BASE_URL + path,
        data=body_str.encode(),
        headers={
            "KEY": config.GATE_API_KEY,
            "SIGN": sign,
            "Timestamp": ts,
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        result = json.load(resp)
    if isinstance(result, dict) and result.get("label") == "INVALID_SIGNATURE":
        raise RuntimeError(f"Gate signature error for {path}: {result}")
    return result


def gate_place_spot_sell(symbol: str, qty: float) -> Dict[str, Any]:
    body = {
        "currency_pair": f"{symbol}_USDT",
        "type": "market",
        "side": "sell",
        "amount": str(qty),
    }
    return gate_signed_post("/api/v4/spot/orders", body)


def gate_place_future_short(symbol: str, qty: float) -> Dict[str, Any]:
    body = {
        "contract": f"{symbol}_USDT",
        "size": -abs(qty),  # 음수 = 숏
        "price": 0,
        "type": "market",
        "time_in_force": "ioc",
        "reduce_only": False,
    }
    return gate_signed_post("/api/v4/futures/usdt/orders", body)


def gate_close_future_short(symbol: str, qty: float) -> Dict[str, Any]:
    body = {
        "contract": f"{symbol}_USDT",
        "size": abs(qty),  # 양수 = 롱 (숏 청산)
        "price": 0,
        "type": "market",
        "time_in_force": "ioc",
        "reduce_only": True,
    }
    return gate_signed_post("/api/v4/futures/usdt/orders", body)


def main() -> None:
    fx = fetch_fx_usdkrw()
    if not fx:
        raise SystemExit("Failed to fetch USD/KRW FX; abort.")

    bt_info = load_bithumb_inout()
    bt_krw = load_bithumb_orderbook(BITHUMB_ORDERBOOK_KRW_URL)
    gt_spot = load_gate_spot_bids()
    gt_fut = load_gate_futures_last()
    gt_status = load_gate_status()

    kimp_table = build_kimp_table(bt_info, bt_krw, gt_spot, gt_status, fx)
    stable_kimp = (bt_krw.get("USDT", 0) / fx) - 1 if fx else 0.0
    print(f"USDT 김프 (빗썸 KRW / FX): {stable_kimp*100:.2f}%")
    # USDT 김프보다 3% 이상 낮은 종목 리스트
    filtered = []
    for sym, row in kimp_table.items():
        relative = (row["kimp_pct"] / 100) - stable_kimp
        if relative <= MIN_RELATIVE_KIMP:
            filtered.append((sym, row, relative))
    filtered.sort(key=lambda x: x[1]["kimp_pct"])  # 할인 큰 순(낮은 김프 순)
    print(f"USDT보다 김프가 3% 이상 낮은 종목: {len(filtered)}개")
    for sym, row, rel in filtered[:20]:
        print(
            f"{sym:8} bh_krw={row['bh_krw']:.4f} bh_usdt={row['bh_usdt']:.6f} "
            f"gt_usdt={row['gt_usdt']:.6f} kimp={row['kimp_pct']:.2f}% "
            f"relative_kimp={rel*100:.2f}%"
        )

    best = compute_best_route(bt_info, bt_krw, gt_spot, gt_fut, gt_status, fx)
    if not best:
        print("No viable symbol found.")
        return

    sym = best["symbol"]
    print("=== Best candidate ===")
    print(json.dumps(best, ensure_ascii=False, indent=2))
    # Execution flow:
    # 1) Gate 선물 1x 숏 포지션 오픈 (분할)
    # 2) 빗썸 시장가 매수 (같은 금액으로 분할)
    # 입출금/USDT 역송/최종 KRW 청산은 사용자 수동
    if not confirm_before_execute(sym, bt_info.get(sym, {}), gt_status.get(sym, {}), best):
        print("사용자 취소로 종료합니다.")
        return
    # 분할 실행
    capital_use = min(config.MAX_TOTAL_USDT, config.CAPITAL_USDT, best["capital_usdt"])
    chunk = config.CHUNK_USDT
    used = 0.0
    leg = 1
    while used + 1e-9 < capital_use:
        this_cap = min(chunk, capital_use - used)
        qty = this_cap / (best["bh_buy"] * (1 + config.BITHUMB_TAKER))
        print(f"[분할 {leg}] cap={this_cap} USDT, qty={qty}")
        try:
            r1 = gate_place_future_short(sym, qty)
            print(f"[분할 {leg}] Gate futures short open: {r1}")
            r2 = bithumb_place_buy(sym, qty, best["bh_buy"])
            print(f"[분할 {leg}] Bithumb spot buy: {r2}")
        except Exception as exc:
            print(f"[분할 {leg}] 실패: {exc}")
            break
        used += this_cap
        leg += 1

    print("입출금 및 Gate 현물 매도/선물 청산, USDT 회수는 수동으로 진행하세요.")


if __name__ == "__main__":
    main()
