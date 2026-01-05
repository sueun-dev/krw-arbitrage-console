"""Execution flows for reverse/kimchi arbitrage."""

from __future__ import annotations

import logging
import time
from typing import Callable, Dict

from .balances import bithumb_spot_balance, gateio_spot_balance
from .calculations import basis_pct, premium_pct
from .exchange_clients import create_bithumb, create_gateio_context
from .fees import BITHUMB_SPOT_TAKER_FEE, GATEIO_PERP_TAKER_FEE, GATEIO_SPOT_TAKER_FEE
from .market_data import (
    fee_adjusted_quote,
    fetch_quotes_by_base,
    fetch_vwap_quote,
    fetch_vwap_quotes_by_base,
    quote_and_size_from_notional,
)
from .models import MarketQuote
from .positions import gateio_perp_short_qty
from .rates import usdt_krw_rate, usdt_krw_rate_label, usdt_krw_rate_source
from .scanner import compute_kimchi_opportunities, compute_reverse_opportunities
from .selection import select_transferable_candidate_coin
from .symbol_universe import get_arbitrage_symbol_universe
from .transfer_eta import build_transfer_eta_entries
from .trading import bithumb_market_buy_base, bithumb_market_sell_base

logger = logging.getLogger(__name__)

DEFAULT_ORDERBOOK_DEPTH = 20

ConfirmFunc = Callable[[], bool]
TransferConfirmFunc = Callable[[str, str], bool]


def _show_top(opps, limit: int = 15) -> None:
    if not opps:
        logger.info("  (없음)")
        return
    for idx, opp in enumerate(opps[:limit], start=1):
        logger.info(
            "%2s) %-10s %+.3f%% | BITHUMB=%s | GATEIO=%s | USDTKRW=%s",
            idx,
            opp.coin,
            opp.premium_pct,
            f"{opp.domestic_price:,.0f}",
            f"{opp.overseas_price:.6f}",
            f"{opp.usdt_krw:,.0f}",
        )


def _apply_fee_to_quotes(
    quotes: Dict[str, MarketQuote],
    buy_fee_rate: float,
    sell_fee_rate: float,
) -> Dict[str, MarketQuote]:
    out: Dict[str, MarketQuote] = {}
    for coin, quote in quotes.items():
        out[coin] = fee_adjusted_quote(quote, buy_fee_rate, sell_fee_rate)
    return out


def _log_transfer_eta(
    chain_pairs,
    b_status,
    g_status,
    direction: str,
) -> None:
    entries = build_transfer_eta_entries(chain_pairs, b_status, g_status, direction)
    if not entries:
        logger.info("체인 예상 입금 소요: 정보 없음")
        return
    logger.info("체인 예상 입금 소요(추정, 수신 기준):")
    for entry in entries:
        pair = f"{entry.canonical_chain} ({entry.bithumb_chain}↔{entry.gateio_chain})"
        if entry.minutes is not None:
            if entry.confirmations:
                logger.info(
                    "  - %s: %s 컨펌 %s, 약 %s분",
                    pair,
                    entry.receive_label,
                    entry.confirmations,
                    entry.minutes,
                )
            else:
                logger.info(
                    "  - %s: %s 컨펌 정보 없음, 1회 기준 약 %s분",
                    pair,
                    entry.receive_label,
                    entry.minutes,
                )
        elif entry.confirmations is not None:
            logger.info(
                "  - %s: %s 컨펌 %s, 시간 정보 없음",
                pair,
                entry.receive_label,
                entry.confirmations,
            )
        else:
            logger.info("  - %s: %s 컨펌 정보 없음, 시간 정보 없음", pair, entry.receive_label)


def _gateio_exchanges(gateio_mgr):
    ex_pair = gateio_mgr.get_exchange("gateio")
    if not ex_pair:
        raise RuntimeError("GateIO exchange not initialized")
    return ex_pair["spot"], ex_pair["perp"]


def _prefilter_reverse_opps(
    bithumb_quotes,
    gateio_perp_quotes,
    usdt_krw: float,
    threshold_pct: float,
):
    b_fee = _apply_fee_to_quotes(bithumb_quotes, BITHUMB_SPOT_TAKER_FEE, BITHUMB_SPOT_TAKER_FEE)
    p_fee = _apply_fee_to_quotes(gateio_perp_quotes, GATEIO_PERP_TAKER_FEE, GATEIO_PERP_TAKER_FEE)
    return compute_reverse_opportunities(b_fee, p_fee, usdt_krw, threshold_pct=threshold_pct)


def _prefilter_kimchi_opps(
    bithumb_quotes,
    gateio_perp_quotes,
    usdt_krw: float,
    threshold_pct: float,
):
    b_fee = _apply_fee_to_quotes(bithumb_quotes, BITHUMB_SPOT_TAKER_FEE, BITHUMB_SPOT_TAKER_FEE)
    p_fee = _apply_fee_to_quotes(gateio_perp_quotes, GATEIO_PERP_TAKER_FEE, GATEIO_PERP_TAKER_FEE)
    return compute_kimchi_opportunities(b_fee, p_fee, usdt_krw, threshold_pct=threshold_pct)


def run_reverse_cycle(
    chunk_usdt: float,
    reverse_threshold_pct: float,
    basis_threshold_pct: float,
    max_chunks: int,
    confirm_live: ConfirmFunc,
    confirm_transfer: TransferConfirmFunc,
    orderbook_depth: int = DEFAULT_ORDERBOOK_DEPTH,
) -> None:
    bithumb = create_bithumb(require_keys=True)
    gateio_mgr, gateio_exec = create_gateio_context(use_public_api=False)
    gate_spot, gate_perp = _gateio_exchanges(gateio_mgr)

    rate_source = usdt_krw_rate_source()
    usdt_krw = usdt_krw_rate(bithumb, rate_source)
    logger.info("USDT/KRW (%s): %s", usdt_krw_rate_label(rate_source), f"{usdt_krw:,.0f}")

    universe = get_arbitrage_symbol_universe(bithumb, gateio_mgr)
    bithumb_symbols = universe.bithumb_krw_symbols
    gate_spot_symbols = universe.gateio_spot_symbols
    gate_perp_symbols = universe.gateio_perp_symbols
    candidates = universe.reverse_candidates
    if not candidates:
        raise RuntimeError("No overlapping Bithumb(KRW) / GateIO(perp) coins found.")

    bithumb_quotes = fetch_quotes_by_base(bithumb, {c: bithumb_symbols[c] for c in candidates})
    gateio_perp_quotes = fetch_quotes_by_base(gate_perp, {c: gate_perp_symbols[c] for c in candidates})

    prefilter_opps = _prefilter_reverse_opps(
        bithumb_quotes,
        gateio_perp_quotes,
        usdt_krw,
        threshold_pct=reverse_threshold_pct,
    )

    prefilter_coins = [opp.coin for opp in prefilter_opps]
    if not prefilter_coins:
        raise RuntimeError("No reverse-premium candidate passes the threshold.")

    perp_raw_quotes: Dict[str, MarketQuote] = {}
    base_qty_by_coin: Dict[str, float] = {}
    for coin in prefilter_coins:
        symbol = gate_perp_symbols[coin]
        result = quote_and_size_from_notional(
            gate_perp,
            symbol,
            chunk_usdt,
            side="sell",
            depth=orderbook_depth,
        )
        if not result:
            continue
        raw_quote, base_qty = result
        perp_raw_quotes[coin] = raw_quote
        base_qty_by_coin[coin] = base_qty

    bithumb_raw_quotes = fetch_vwap_quotes_by_base(
        bithumb,
        {c: bithumb_symbols[c] for c in base_qty_by_coin},
        base_qty_by_coin,
        depth=orderbook_depth,
    )
    gateio_spot_raw_quotes = fetch_vwap_quotes_by_base(
        gate_spot,
        {c: gate_spot_symbols[c] for c in base_qty_by_coin if c in gate_spot_symbols},
        base_qty_by_coin,
        depth=orderbook_depth,
    )

    bithumb_eff_quotes = _apply_fee_to_quotes(bithumb_raw_quotes, BITHUMB_SPOT_TAKER_FEE, BITHUMB_SPOT_TAKER_FEE)
    perp_eff_quotes = _apply_fee_to_quotes(perp_raw_quotes, GATEIO_PERP_TAKER_FEE, GATEIO_PERP_TAKER_FEE)
    gateio_spot_eff_quotes = _apply_fee_to_quotes(
        gateio_spot_raw_quotes,
        GATEIO_SPOT_TAKER_FEE,
        GATEIO_SPOT_TAKER_FEE,
    )

    opps = compute_reverse_opportunities(
        bithumb_eff_quotes,
        perp_eff_quotes,
        usdt_krw,
        threshold_pct=reverse_threshold_pct,
    )

    logger.info("\n[1] 역프 후보 (VWAP 기준) – 상위 %s개", min(15, len(opps)))
    _show_top(opps, limit=15)

    selected = select_transferable_candidate_coin(
        opps,
        gateio_spot_eff_quotes,
        perp_eff_quotes,
        gate_spot,
        basis_threshold_pct,
        mode="unwind",
    )
    if not selected:
        raise RuntimeError("No reverse-premium candidate satisfies GateIO basis + transfer constraints.")
    coin, b_status, g_status, chain_pairs = selected
    chain_str = ", ".join(f"{b}↔{g}" for b, g in chain_pairs) if chain_pairs else "N/A"

    logger.info("\n선정 코인: %s", coin)
    logger.info(
        "Bithumb deposit: %s | withdraw: %s || GateIO deposit: %s | withdraw: %s || common chains: %s",
        b_status.deposit_ok,
        b_status.withdraw_ok,
        g_status.deposit_ok,
        g_status.withdraw_ok,
        chain_str,
    )
    _log_transfer_eta(chain_pairs, b_status, g_status, "bithumb_to_gateio")

    if not confirm_live():
        return

    gateio_mgr.load_markets_for_coin(coin)
    bithumb_symbol = bithumb_symbols[coin]

    for idx in range(1, max_chunks + 1):
        logger.info("\n[4] 진입 청크 %s/%s (%s USDT)", idx, max_chunks, chunk_usdt)

        perp_result = quote_and_size_from_notional(
            gate_perp,
            gateio_mgr.symbols["gateio"]["perp"],
            chunk_usdt,
            side="sell",
            depth=orderbook_depth,
        )
        if not perp_result:
            raise RuntimeError("Failed to fetch live orderbook for entry")
        perp_raw_quote, base_qty = perp_result

        bithumb_raw_quote = fetch_vwap_quote(bithumb, bithumb_symbol, base_qty, depth=orderbook_depth)
        if not bithumb_raw_quote:
            raise RuntimeError("Failed to fetch live orderbook for entry")

        bithumb_fee = fee_adjusted_quote(bithumb_raw_quote, BITHUMB_SPOT_TAKER_FEE, BITHUMB_SPOT_TAKER_FEE)
        perp_fee = fee_adjusted_quote(perp_raw_quote, GATEIO_PERP_TAKER_FEE, GATEIO_PERP_TAKER_FEE)
        current_pct = premium_pct(bithumb_fee.ask, perp_fee.bid, usdt_krw)
        logger.info("역프(VWAP 기준): %+0.3f%%", current_pct)
        if current_pct > reverse_threshold_pct:
            logger.warning("임계값 미충족 → 중단 (threshold=%s%%)", reverse_threshold_pct)
            break

        target_qty = base_qty
        perp_filled, _ = gateio_exec.execute_perp_short("gateio", target_qty, coin, fast=False)
        spot_filled = bithumb_market_buy_base(bithumb, bithumb_symbol, perp_filled, coin)

        diff = spot_filled - perp_filled
        if abs(diff) > 1e-8:
            logger.warning("수량 불일치: bithumb=%.8f, gateio_perp=%.8f (diff=%.8f)", spot_filled, perp_filled, diff)
            try:
                if diff < 0:
                    gateio_exec.execute_perp_cover("gateio", abs(diff), coin)
                else:
                    gateio_exec.execute_perp_short("gateio", diff, coin, fast=False)
            except Exception as exc:
                logger.warning("수량 리밸런싱 실패: %s", exc)

    if not confirm_transfer(coin, "bithumb_to_gateio"):
        return

    logger.info("\n[6] GateIO에서 현물 매도 + 선물 숏 청산(매수) 시작 (청크=%s USDT)", chunk_usdt)
    gateio_mgr.load_markets_for_coin(coin)

    while True:
        short_qty = gateio_perp_short_qty(gate_perp, coin)
        spot_qty = gateio_spot_balance(gate_spot, coin)
        if short_qty <= 0 or spot_qty <= 0:
            logger.info("종료: short=%.8f, spot=%.8f", short_qty, spot_qty)
            break

        spot_result = quote_and_size_from_notional(
            gate_spot,
            gateio_mgr.symbols["gateio"]["spot"],
            chunk_usdt,
            side="sell",
            depth=orderbook_depth,
        )
        if not spot_result:
            logger.warning("가격 조회 실패, 10초 후 재시도")
            time.sleep(10)
            continue
        spot_raw_quote, base_qty = spot_result

        perp_raw_quote = fetch_vwap_quote(gate_perp, gateio_mgr.symbols["gateio"]["perp"], base_qty, depth=orderbook_depth)
        if not perp_raw_quote:
            logger.warning("가격 조회 실패, 10초 후 재시도")
            time.sleep(10)
            continue

        spot_fee = fee_adjusted_quote(spot_raw_quote, GATEIO_SPOT_TAKER_FEE, GATEIO_SPOT_TAKER_FEE)
        perp_fee = fee_adjusted_quote(perp_raw_quote, GATEIO_PERP_TAKER_FEE, GATEIO_PERP_TAKER_FEE)
        gap = basis_pct(spot_fee.bid, perp_fee.ask)
        if gap > basis_threshold_pct:
            logger.info("괴리 %.3f%% > %.3f%% → 대기(10s)", gap, basis_threshold_pct)
            time.sleep(10)
            continue

        qty = min(base_qty, short_qty, spot_qty)
        if qty <= 0:
            break

        covered = gateio_exec.execute_perp_cover("gateio", qty, coin)
        gateio_exec.execute_spot_sell("gateio", covered, coin)


def run_kimchi_cycle(
    chunk_usdt: float,
    kimchi_threshold_pct: float,
    basis_threshold_pct: float,
    max_chunks: int,
    confirm_live: ConfirmFunc,
    confirm_transfer: TransferConfirmFunc,
    orderbook_depth: int = DEFAULT_ORDERBOOK_DEPTH,
) -> None:
    bithumb = create_bithumb(require_keys=True)
    gateio_mgr, gateio_exec = create_gateio_context(use_public_api=False)
    gate_spot, gate_perp = _gateio_exchanges(gateio_mgr)

    rate_source = usdt_krw_rate_source()
    usdt_krw = usdt_krw_rate(bithumb, rate_source)
    logger.info("USDT/KRW (%s): %s", usdt_krw_rate_label(rate_source), f"{usdt_krw:,.0f}")

    universe = get_arbitrage_symbol_universe(bithumb, gateio_mgr)
    bithumb_symbols = universe.bithumb_krw_symbols
    gate_spot_symbols = universe.gateio_spot_symbols
    gate_perp_symbols = universe.gateio_perp_symbols
    candidates = universe.kimchi_candidates
    if not candidates:
        raise RuntimeError("No overlapping Bithumb(KRW) / GateIO(spot+perp) coins found.")

    bithumb_quotes = fetch_quotes_by_base(bithumb, {c: bithumb_symbols[c] for c in candidates})
    gateio_perp_quotes = fetch_quotes_by_base(gate_perp, {c: gate_perp_symbols[c] for c in candidates})

    prefilter_opps = _prefilter_kimchi_opps(
        bithumb_quotes,
        gateio_perp_quotes,
        usdt_krw,
        threshold_pct=kimchi_threshold_pct,
    )

    prefilter_coins = [opp.coin for opp in prefilter_opps]
    if not prefilter_coins:
        raise RuntimeError("No kimchi-premium candidate passes the threshold.")

    perp_raw_quotes: Dict[str, MarketQuote] = {}
    base_qty_by_coin: Dict[str, float] = {}
    for coin in prefilter_coins:
        symbol = gate_perp_symbols[coin]
        result = quote_and_size_from_notional(
            gate_perp,
            symbol,
            chunk_usdt,
            side="sell",
            depth=orderbook_depth,
        )
        if not result:
            continue
        raw_quote, base_qty = result
        perp_raw_quotes[coin] = raw_quote
        base_qty_by_coin[coin] = base_qty

    bithumb_raw_quotes = fetch_vwap_quotes_by_base(
        bithumb,
        {c: bithumb_symbols[c] for c in base_qty_by_coin},
        base_qty_by_coin,
        depth=orderbook_depth,
    )
    gateio_spot_raw_quotes = fetch_vwap_quotes_by_base(
        gate_spot,
        {c: gate_spot_symbols[c] for c in base_qty_by_coin if c in gate_spot_symbols},
        base_qty_by_coin,
        depth=orderbook_depth,
    )

    bithumb_eff_quotes = _apply_fee_to_quotes(bithumb_raw_quotes, BITHUMB_SPOT_TAKER_FEE, BITHUMB_SPOT_TAKER_FEE)
    perp_eff_quotes = _apply_fee_to_quotes(perp_raw_quotes, GATEIO_PERP_TAKER_FEE, GATEIO_PERP_TAKER_FEE)
    gateio_spot_eff_quotes = _apply_fee_to_quotes(
        gateio_spot_raw_quotes,
        GATEIO_SPOT_TAKER_FEE,
        GATEIO_SPOT_TAKER_FEE,
    )

    opps = compute_kimchi_opportunities(
        bithumb_eff_quotes,
        perp_eff_quotes,
        usdt_krw,
        threshold_pct=kimchi_threshold_pct,
    )

    logger.info("\n[7] 김프 후보 (VWAP 기준) – 상위 %s개", min(15, len(opps)))
    _show_top(opps, limit=15)

    selected = select_transferable_candidate_coin(
        opps,
        gateio_spot_eff_quotes,
        perp_eff_quotes,
        gate_spot,
        basis_threshold_pct,
        mode="entry",
    )
    if not selected:
        raise RuntimeError("No kimchi-premium candidate satisfies GateIO basis + transfer constraints.")
    coin, b_status, g_status, chain_pairs = selected
    chain_str = ", ".join(f"{b}↔{g}" for b, g in chain_pairs) if chain_pairs else "N/A"

    logger.info("\n선정 코인: %s", coin)
    logger.info(
        "Bithumb deposit: %s | withdraw: %s || GateIO deposit: %s | withdraw: %s || common chains: %s",
        b_status.deposit_ok,
        b_status.withdraw_ok,
        g_status.deposit_ok,
        g_status.withdraw_ok,
        chain_str,
    )
    _log_transfer_eta(chain_pairs, b_status, g_status, "gateio_to_bithumb")

    if not confirm_live():
        return

    gateio_mgr.load_markets_for_coin(coin)
    bithumb_symbol = bithumb_symbols[coin]

    logger.info("\n[9] GateIO에서 현물 매수 + 선물 숏(매도) 진입 (청크=%s USDT)", chunk_usdt)
    for idx in range(1, max_chunks + 1):
        while True:
            perp_result = quote_and_size_from_notional(
                gate_perp,
                gateio_mgr.symbols["gateio"]["perp"],
                chunk_usdt,
                side="sell",
                depth=orderbook_depth,
            )
            if not perp_result:
                logger.warning("가격 조회 실패, 10초 후 재시도")
                time.sleep(10)
                continue
            perp_raw_quote, base_qty = perp_result

            spot_raw_quote = fetch_vwap_quote(
                gate_spot,
                gateio_mgr.symbols["gateio"]["spot"],
                base_qty,
                depth=orderbook_depth,
            )
            if not spot_raw_quote:
                logger.warning("가격 조회 실패, 10초 후 재시도")
                time.sleep(10)
                continue

            spot_fee = fee_adjusted_quote(spot_raw_quote, GATEIO_SPOT_TAKER_FEE, GATEIO_SPOT_TAKER_FEE)
            perp_fee = fee_adjusted_quote(perp_raw_quote, GATEIO_PERP_TAKER_FEE, GATEIO_PERP_TAKER_FEE)
            gap = basis_pct(spot_fee.ask, perp_fee.bid)
            if gap > basis_threshold_pct:
                logger.info("괴리 %.3f%% > %.3f%% → 대기(10s)", gap, basis_threshold_pct)
                time.sleep(10)
                continue

            bithumb_raw_quote = fetch_vwap_quote(
                bithumb,
                bithumb_symbol,
                base_qty,
                depth=orderbook_depth,
            )
            if not bithumb_raw_quote:
                logger.warning("가격 조회 실패(Bithumb), 10초 후 재시도")
                time.sleep(10)
                continue

            bithumb_fee = fee_adjusted_quote(bithumb_raw_quote, BITHUMB_SPOT_TAKER_FEE, BITHUMB_SPOT_TAKER_FEE)
            current_pct = premium_pct(bithumb_fee.bid, perp_fee.ask, usdt_krw)
            if current_pct < kimchi_threshold_pct:
                logger.info(
                    "김프 %.3f%% < %.3f%% → 대기(10s)",
                    current_pct,
                    kimchi_threshold_pct,
                )
                time.sleep(10)
                continue
            break

        logger.info("진입 청크 %s/%s", idx, max_chunks)
        target_qty = base_qty
        perp_filled, _ = gateio_exec.execute_perp_short("gateio", target_qty, coin, fast=False)
        spot_usdt = perp_filled * spot_raw_quote.ask
        spot_filled = gateio_exec.execute_spot_buy("gateio", spot_usdt, coin)

        diff = spot_filled - perp_filled
        if abs(diff) > 1e-8:
            logger.warning(
                "수량 불일치: gateio_spot=%.8f, gateio_perp=%.8f (diff=%.8f)",
                spot_filled,
                perp_filled,
                diff,
            )
            try:
                if diff < 0:
                    gateio_exec.execute_perp_cover("gateio", abs(diff), coin)
                else:
                    gateio_exec.execute_perp_short("gateio", diff, coin, fast=False)
            except Exception as exc:
                logger.warning("수량 리밸런싱 실패: %s", exc)

    if not confirm_transfer(coin, "gateio_to_bithumb"):
        return

    logger.info("\n[11] Bithumb 매도 + GateIO 선물 숏 청산(매수) 시작 (청크=%s USDT)", chunk_usdt)
    while True:
        short_qty = gateio_perp_short_qty(gate_perp, coin)
        spot_qty = bithumb_spot_balance(bithumb, coin)
        if short_qty <= 0 or spot_qty <= 0:
            logger.info("종료: short=%.8f, bithumb_spot=%.8f", short_qty, spot_qty)
            break

        perp_result = quote_and_size_from_notional(
            gate_perp,
            gateio_mgr.symbols["gateio"]["perp"],
            chunk_usdt,
            side="buy",
            depth=orderbook_depth,
        )
        if not perp_result:
            logger.warning("가격 조회 실패, 10초 후 재시도")
            time.sleep(10)
            continue
        perp_raw_quote, base_qty = perp_result

        bithumb_raw_quote = fetch_vwap_quote(bithumb, bithumb_symbol, base_qty, depth=orderbook_depth)
        if not bithumb_raw_quote:
            logger.warning("가격 조회 실패, 10초 후 재시도")
            time.sleep(10)
            continue

        bithumb_fee = fee_adjusted_quote(bithumb_raw_quote, BITHUMB_SPOT_TAKER_FEE, BITHUMB_SPOT_TAKER_FEE)
        perp_fee = fee_adjusted_quote(perp_raw_quote, GATEIO_PERP_TAKER_FEE, GATEIO_PERP_TAKER_FEE)
        current_pct = premium_pct(bithumb_fee.bid, perp_fee.ask, usdt_krw)
        logger.info("현재 김프(VWAP 기준): %+0.3f%%", current_pct)
        if current_pct < 0:
            logger.info("김프가 음수 → 대기(10s)")
            time.sleep(10)
            continue

        qty = min(base_qty, short_qty, spot_qty)
        if qty <= 0:
            break

        covered = gateio_exec.execute_perp_cover("gateio", qty, coin)
        bithumb_market_sell_base(bithumb, bithumb_symbol, covered, coin)
