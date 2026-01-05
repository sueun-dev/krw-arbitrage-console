"""Live market-data simulations using fake capital (no orders)."""

from __future__ import annotations

import math
import os
import time
from typing import Iterable, Tuple

import pytest

from arbitrage.calculations import basis_pct, premium_pct
from arbitrage.exchange_clients import create_bithumb, create_gateio_context
from arbitrage.fees import BITHUMB_SPOT_TAKER_FEE, GATEIO_PERP_TAKER_FEE, GATEIO_SPOT_TAKER_FEE
from arbitrage.market_data import fee_adjusted_quote, fetch_vwap_quote, quote_and_size_from_notional
from arbitrage.rates import usdt_krw_rate
from arbitrage.symbol_universe import get_arbitrage_symbol_universe

CHUNK_USDT = 50.0
ORDERBOOK_DEPTH = 20
MAX_CANDIDATES = 40
RETRY_ATTEMPTS = 3
RETRY_SLEEP = 1.0
REVERSE_ENTRY_THRESHOLD = 0.0
KIMCHI_ENTRY_THRESHOLD = 0.0
BASIS_THRESHOLD = 0.15
COMBINED_MAX_WAIT_SEC = float(os.getenv("ARBI_COMBINED_WAIT_SEC", "30"))
TRANSFER_SLEEP = 1.0


def _retry(func):
    for _ in range(RETRY_ATTEMPTS):
        result = func()
        if result:
            return result
        time.sleep(RETRY_SLEEP)
    return None


def _select_live_coin(
    bithumb,
    gateio_mgr,
    gate_spot,
    gate_perp,
    bithumb_symbols,
    candidates: Iterable[str],
    usdt_krw: float,
    direction: str,
    threshold_pct: float,
) -> Tuple[str, str, float]:
    if direction not in {"reverse", "kimchi"}:
        raise ValueError("direction must be 'reverse' or 'kimchi'")

    for coin in list(candidates)[:MAX_CANDIDATES]:
        bithumb_symbol = bithumb_symbols.get(coin)
        if not bithumb_symbol:
            continue
        try:
            gateio_mgr.load_markets_for_coin(coin)
        except Exception:
            continue

        symbols = gateio_mgr.symbols.get("gateio") or {}
        gateio_spot_symbol = symbols.get("spot")
        gateio_perp_symbol = symbols.get("perp")
        if not gateio_spot_symbol or not gateio_perp_symbol:
            continue

        perp_result = _retry(
            lambda: quote_and_size_from_notional(
                gate_perp,
                gateio_perp_symbol,
                CHUNK_USDT,
                side="sell",
                depth=ORDERBOOK_DEPTH,
            )
        )
        if not perp_result:
            continue
        _perp_quote, base_qty = perp_result
        if base_qty <= 0:
            continue

        bithumb_quote = _retry(
            lambda: fetch_vwap_quote(bithumb, bithumb_symbol, base_qty, depth=ORDERBOOK_DEPTH)
        )
        gateio_spot_quote = _retry(
            lambda: fetch_vwap_quote(gate_spot, gateio_spot_symbol, base_qty, depth=ORDERBOOK_DEPTH)
        )
        if not bithumb_quote or not gateio_spot_quote:
            continue

        bithumb_fee = fee_adjusted_quote(bithumb_quote, BITHUMB_SPOT_TAKER_FEE, BITHUMB_SPOT_TAKER_FEE)
        perp_fee = fee_adjusted_quote(_perp_quote, GATEIO_PERP_TAKER_FEE, GATEIO_PERP_TAKER_FEE)

        if direction == "reverse":
            premium = premium_pct(bithumb_fee.ask, perp_fee.bid, usdt_krw)
            if premium > threshold_pct:
                continue
        else:
            premium = premium_pct(bithumb_fee.bid, perp_fee.ask, usdt_krw)
            if premium < threshold_pct:
                continue

        return coin, bithumb_symbol, base_qty

    pytest.skip("No candidate coin meets the premium condition.")


def _fetch_quotes(bithumb, gateio_mgr, gate_spot, gate_perp, bithumb_symbol: str, coin: str, base_qty: float):
    gateio_mgr.load_markets_for_coin(coin)
    symbols = gateio_mgr.symbols["gateio"]

    bithumb_quote = fetch_vwap_quote(bithumb, bithumb_symbol, base_qty, depth=ORDERBOOK_DEPTH)
    gateio_spot_quote = fetch_vwap_quote(gate_spot, symbols["spot"], base_qty, depth=ORDERBOOK_DEPTH)
    gateio_perp_quote = fetch_vwap_quote(gate_perp, symbols["perp"], base_qty, depth=ORDERBOOK_DEPTH)

    if not bithumb_quote or not gateio_spot_quote or not gateio_perp_quote:
        pytest.skip("Live orderbook unavailable for selected coin.")

    return bithumb_quote, gateio_spot_quote, gateio_perp_quote


def _wait_for_condition(deadline: float, func):
    while time.time() < deadline:
        result = func()
        if result:
            return result
        time.sleep(RETRY_SLEEP)
    return None


def _try_reverse_entry(bithumb, gateio_mgr, gate_spot, gate_perp, bithumb_symbols, coin, usdt_krw):
    bithumb_symbol = bithumb_symbols.get(coin)
    if not bithumb_symbol:
        return None
    try:
        gateio_mgr.load_markets_for_coin(coin)
    except Exception:
        return None

    symbols = gateio_mgr.symbols.get("gateio") or {}
    gateio_spot_symbol = symbols.get("spot")
    gateio_perp_symbol = symbols.get("perp")
    if not gateio_spot_symbol or not gateio_perp_symbol:
        return None

    perp_result = _retry(
        lambda: quote_and_size_from_notional(
            gate_perp,
            gateio_perp_symbol,
            CHUNK_USDT,
            side="sell",
            depth=ORDERBOOK_DEPTH,
        )
    )
    if not perp_result:
        return None
    perp_raw, base_qty = perp_result
    if base_qty <= 0:
        return None

    bithumb_raw = _retry(lambda: fetch_vwap_quote(bithumb, bithumb_symbol, base_qty, depth=ORDERBOOK_DEPTH))
    gateio_spot_raw = _retry(lambda: fetch_vwap_quote(gate_spot, gateio_spot_symbol, base_qty, depth=ORDERBOOK_DEPTH))
    if not bithumb_raw or not gateio_spot_raw:
        return None

    bithumb_fee = fee_adjusted_quote(bithumb_raw, BITHUMB_SPOT_TAKER_FEE, BITHUMB_SPOT_TAKER_FEE)
    perp_fee = fee_adjusted_quote(perp_raw, GATEIO_PERP_TAKER_FEE, GATEIO_PERP_TAKER_FEE)

    premium = premium_pct(bithumb_fee.ask, perp_fee.bid, usdt_krw)
    if premium > REVERSE_ENTRY_THRESHOLD:
        return None

    return {
        "coin": coin,
        "bithumb_symbol": bithumb_symbol,
        "base_qty": base_qty,
        "bithumb_fee": bithumb_fee,
        "perp_fee": perp_fee,
    }


def _try_reverse_unwind(bithumb, gateio_mgr, gate_spot, gate_perp, coin, base_qty):
    try:
        gateio_mgr.load_markets_for_coin(coin)
    except Exception:
        return None

    symbols = gateio_mgr.symbols.get("gateio") or {}
    gateio_spot_symbol = symbols.get("spot")
    gateio_perp_symbol = symbols.get("perp")
    if not gateio_spot_symbol or not gateio_perp_symbol:
        return None

    gateio_spot_raw = _retry(lambda: fetch_vwap_quote(gate_spot, gateio_spot_symbol, base_qty, depth=ORDERBOOK_DEPTH))
    gateio_perp_raw = _retry(lambda: fetch_vwap_quote(gate_perp, gateio_perp_symbol, base_qty, depth=ORDERBOOK_DEPTH))
    if not gateio_spot_raw or not gateio_perp_raw:
        return None

    spot_fee = fee_adjusted_quote(gateio_spot_raw, GATEIO_SPOT_TAKER_FEE, GATEIO_SPOT_TAKER_FEE)
    perp_fee = fee_adjusted_quote(gateio_perp_raw, GATEIO_PERP_TAKER_FEE, GATEIO_PERP_TAKER_FEE)

    if basis_pct(spot_fee.bid, perp_fee.ask) > BASIS_THRESHOLD:
        return None

    return {"spot_fee": spot_fee, "perp_fee": perp_fee}


def _try_kimchi_entry(bithumb, gateio_mgr, gate_spot, gate_perp, bithumb_symbol, coin, usdt_krw):
    try:
        gateio_mgr.load_markets_for_coin(coin)
    except Exception:
        return None

    symbols = gateio_mgr.symbols.get("gateio") or {}
    gateio_spot_symbol = symbols.get("spot")
    gateio_perp_symbol = symbols.get("perp")
    if not gateio_spot_symbol or not gateio_perp_symbol:
        return None

    perp_result = _retry(
        lambda: quote_and_size_from_notional(
            gate_perp,
            gateio_perp_symbol,
            CHUNK_USDT,
            side="sell",
            depth=ORDERBOOK_DEPTH,
        )
    )
    if not perp_result:
        return None
    perp_raw, base_qty = perp_result
    if base_qty <= 0:
        return None

    bithumb_raw = _retry(lambda: fetch_vwap_quote(bithumb, bithumb_symbol, base_qty, depth=ORDERBOOK_DEPTH))
    gateio_spot_raw = _retry(lambda: fetch_vwap_quote(gate_spot, gateio_spot_symbol, base_qty, depth=ORDERBOOK_DEPTH))
    if not bithumb_raw or not gateio_spot_raw:
        return None

    bithumb_fee = fee_adjusted_quote(bithumb_raw, BITHUMB_SPOT_TAKER_FEE, BITHUMB_SPOT_TAKER_FEE)
    gateio_spot_fee = fee_adjusted_quote(gateio_spot_raw, GATEIO_SPOT_TAKER_FEE, GATEIO_SPOT_TAKER_FEE)
    perp_fee = fee_adjusted_quote(perp_raw, GATEIO_PERP_TAKER_FEE, GATEIO_PERP_TAKER_FEE)

    premium = premium_pct(bithumb_fee.bid, perp_fee.ask, usdt_krw)
    if premium < KIMCHI_ENTRY_THRESHOLD:
        return None

    if basis_pct(gateio_spot_fee.ask, perp_fee.bid) > BASIS_THRESHOLD:
        return None

    return {
        "base_qty": base_qty,
        "spot_fee": gateio_spot_fee,
        "perp_fee": perp_fee,
    }


def _try_kimchi_unwind(bithumb, gateio_mgr, gate_spot, gate_perp, bithumb_symbol, coin, base_qty, usdt_krw):
    try:
        gateio_mgr.load_markets_for_coin(coin)
    except Exception:
        return None

    symbols = gateio_mgr.symbols.get("gateio") or {}
    gateio_perp_symbol = symbols.get("perp")
    if not gateio_perp_symbol:
        return None

    bithumb_raw = _retry(lambda: fetch_vwap_quote(bithumb, bithumb_symbol, base_qty, depth=ORDERBOOK_DEPTH))
    gateio_perp_raw = _retry(lambda: fetch_vwap_quote(gate_perp, gateio_perp_symbol, base_qty, depth=ORDERBOOK_DEPTH))
    if not bithumb_raw or not gateio_perp_raw:
        return None

    bithumb_fee = fee_adjusted_quote(bithumb_raw, BITHUMB_SPOT_TAKER_FEE, BITHUMB_SPOT_TAKER_FEE)
    perp_fee = fee_adjusted_quote(gateio_perp_raw, GATEIO_PERP_TAKER_FEE, GATEIO_PERP_TAKER_FEE)

    premium = premium_pct(bithumb_fee.bid, perp_fee.ask, usdt_krw)
    if premium < 0:
        return None

    return {"bithumb_fee": bithumb_fee, "perp_fee": perp_fee, "premium": premium}


def test_live_reverse_route_simulation() -> None:
    bithumb = create_bithumb(require_keys=False)
    gateio_mgr, _ = create_gateio_context(use_public_api=True)
    gate_pair = gateio_mgr.get_exchange("gateio")
    if not gate_pair:
        pytest.skip("GateIO exchange unavailable.")
    gate_spot, gate_perp = gate_pair["spot"], gate_pair["perp"]

    usdt_krw = usdt_krw_rate(bithumb)
    universe = get_arbitrage_symbol_universe(bithumb, gateio_mgr)
    candidates = universe.reverse_candidates or universe.kimchi_candidates

    coin, bithumb_symbol, base_qty = _select_live_coin(
        bithumb,
        gateio_mgr,
        gate_spot,
        gate_perp,
        universe.bithumb_krw_symbols,
        candidates,
        usdt_krw,
        direction="reverse",
        threshold_pct=REVERSE_ENTRY_THRESHOLD,
    )

    bithumb_raw, gateio_spot_raw, gateio_perp_raw = _fetch_quotes(
        bithumb, gateio_mgr, gate_spot, gate_perp, bithumb_symbol, coin, base_qty
    )

    bithumb_fee = fee_adjusted_quote(bithumb_raw, BITHUMB_SPOT_TAKER_FEE, BITHUMB_SPOT_TAKER_FEE)
    gateio_spot_fee = fee_adjusted_quote(gateio_spot_raw, GATEIO_SPOT_TAKER_FEE, GATEIO_SPOT_TAKER_FEE)
    gateio_perp_fee = fee_adjusted_quote(gateio_perp_raw, GATEIO_PERP_TAKER_FEE, GATEIO_PERP_TAKER_FEE)

    reverse_premium = premium_pct(bithumb_fee.ask, gateio_perp_fee.bid, usdt_krw)
    unwind_basis = basis_pct(gateio_spot_fee.bid, gateio_perp_fee.ask)

    spot_cost_usdt = (bithumb_fee.ask * base_qty) / usdt_krw
    spot_proceeds_usdt = gateio_spot_fee.bid * base_qty
    perp_pnl_usdt = (gateio_perp_fee.bid - gateio_perp_fee.ask) * base_qty
    total_pnl_usdt = spot_proceeds_usdt - spot_cost_usdt + perp_pnl_usdt

    assert math.isfinite(total_pnl_usdt)

    print(
        f"[reverse] coin={coin} qty={base_qty:.8f} premium={reverse_premium:+.3f}% "
        f"basis={unwind_basis:.3f}% pnl=${total_pnl_usdt:.4f} (chunk={CHUNK_USDT} USDT)"
    )


def test_live_kimchi_route_simulation() -> None:
    bithumb = create_bithumb(require_keys=False)
    gateio_mgr, _ = create_gateio_context(use_public_api=True)
    gate_pair = gateio_mgr.get_exchange("gateio")
    if not gate_pair:
        pytest.skip("GateIO exchange unavailable.")
    gate_spot, gate_perp = gate_pair["spot"], gate_pair["perp"]

    usdt_krw = usdt_krw_rate(bithumb)
    universe = get_arbitrage_symbol_universe(bithumb, gateio_mgr)
    candidates = universe.kimchi_candidates or universe.reverse_candidates

    coin, bithumb_symbol, base_qty = _select_live_coin(
        bithumb,
        gateio_mgr,
        gate_spot,
        gate_perp,
        universe.bithumb_krw_symbols,
        candidates,
        usdt_krw,
        direction="kimchi",
        threshold_pct=KIMCHI_ENTRY_THRESHOLD,
    )

    bithumb_raw, gateio_spot_raw, gateio_perp_raw = _fetch_quotes(
        bithumb, gateio_mgr, gate_spot, gate_perp, bithumb_symbol, coin, base_qty
    )

    bithumb_fee = fee_adjusted_quote(bithumb_raw, BITHUMB_SPOT_TAKER_FEE, BITHUMB_SPOT_TAKER_FEE)
    gateio_spot_fee = fee_adjusted_quote(gateio_spot_raw, GATEIO_SPOT_TAKER_FEE, GATEIO_SPOT_TAKER_FEE)
    gateio_perp_fee = fee_adjusted_quote(gateio_perp_raw, GATEIO_PERP_TAKER_FEE, GATEIO_PERP_TAKER_FEE)

    kimchi_premium = premium_pct(bithumb_fee.bid, gateio_perp_fee.ask, usdt_krw)
    entry_basis = basis_pct(gateio_spot_fee.ask, gateio_perp_fee.bid)

    spot_cost_usdt = gateio_spot_fee.ask * base_qty
    spot_proceeds_usdt = (bithumb_fee.bid * base_qty) / usdt_krw
    perp_pnl_usdt = (gateio_perp_fee.bid - gateio_perp_fee.ask) * base_qty
    total_pnl_usdt = spot_proceeds_usdt - spot_cost_usdt + perp_pnl_usdt

    assert math.isfinite(total_pnl_usdt)

    print(
        f"[kimchi] coin={coin} qty={base_qty:.8f} premium={kimchi_premium:+.3f}% "
        f"basis={entry_basis:.3f}% pnl=${total_pnl_usdt:.4f} (chunk={CHUNK_USDT} USDT)"
    )


def test_live_combined_reverse_then_kimchi_simulation() -> None:
    bithumb = create_bithumb(require_keys=False)
    gateio_mgr, _ = create_gateio_context(use_public_api=True)
    gate_pair = gateio_mgr.get_exchange("gateio")
    if not gate_pair:
        pytest.skip("GateIO exchange unavailable.")
    gate_spot, gate_perp = gate_pair["spot"], gate_pair["perp"]

    usdt_krw = usdt_krw_rate(bithumb)
    universe = get_arbitrage_symbol_universe(bithumb, gateio_mgr)
    candidates = universe.kimchi_candidates or universe.reverse_candidates

    reverse_entry = None
    deadline = time.time() + COMBINED_MAX_WAIT_SEC
    while time.time() < deadline and not reverse_entry:
        for coin in list(candidates)[:MAX_CANDIDATES]:
            reverse_entry = _try_reverse_entry(
                bithumb,
                gateio_mgr,
                gate_spot,
                gate_perp,
                universe.bithumb_krw_symbols,
                coin,
                usdt_krw,
            )
            if reverse_entry:
                break
        if not reverse_entry:
            time.sleep(RETRY_SLEEP)

    if not reverse_entry:
        pytest.skip("No reverse entry condition within time budget.")

    time.sleep(TRANSFER_SLEEP)
    reverse_unwind = _wait_for_condition(
        time.time() + COMBINED_MAX_WAIT_SEC,
        lambda: _try_reverse_unwind(
            bithumb,
            gateio_mgr,
            gate_spot,
            gate_perp,
            reverse_entry["coin"],
            reverse_entry["base_qty"],
        ),
    )
    if not reverse_unwind:
        pytest.skip("Reverse unwind condition not met.")

    reverse_spot_cost = (reverse_entry["bithumb_fee"].ask * reverse_entry["base_qty"]) / usdt_krw
    reverse_spot_proceeds = reverse_unwind["spot_fee"].bid * reverse_entry["base_qty"]
    reverse_perp_pnl = (reverse_entry["perp_fee"].bid - reverse_unwind["perp_fee"].ask) * reverse_entry["base_qty"]
    reverse_total = reverse_spot_proceeds - reverse_spot_cost + reverse_perp_pnl

    time.sleep(TRANSFER_SLEEP)
    kimchi_entry = _wait_for_condition(
        time.time() + COMBINED_MAX_WAIT_SEC,
        lambda: _try_kimchi_entry(
            bithumb,
            gateio_mgr,
            gate_spot,
            gate_perp,
            reverse_entry["bithumb_symbol"],
            reverse_entry["coin"],
            usdt_krw,
        ),
    )
    if not kimchi_entry:
        pytest.skip("Kimchi entry condition not met.")

    time.sleep(TRANSFER_SLEEP)
    kimchi_unwind = _wait_for_condition(
        time.time() + COMBINED_MAX_WAIT_SEC,
        lambda: _try_kimchi_unwind(
            bithumb,
            gateio_mgr,
            gate_spot,
            gate_perp,
            reverse_entry["bithumb_symbol"],
            reverse_entry["coin"],
            kimchi_entry["base_qty"],
            usdt_krw,
        ),
    )
    if not kimchi_unwind:
        pytest.skip("Kimchi unwind condition not met.")

    kimchi_spot_cost = kimchi_entry["spot_fee"].ask * kimchi_entry["base_qty"]
    kimchi_spot_proceeds = (kimchi_unwind["bithumb_fee"].bid * kimchi_entry["base_qty"]) / usdt_krw
    kimchi_perp_pnl = (kimchi_entry["perp_fee"].bid - kimchi_unwind["perp_fee"].ask) * kimchi_entry["base_qty"]
    kimchi_total = kimchi_spot_proceeds - kimchi_spot_cost + kimchi_perp_pnl

    total_pnl = reverse_total + kimchi_total

    assert math.isfinite(total_pnl)

    print(
        f"[combined] coin={reverse_entry['coin']} "
        f"reverse_pnl=${reverse_total:.4f} kimchi_pnl=${kimchi_total:.4f} total=${total_pnl:.4f}"
    )
