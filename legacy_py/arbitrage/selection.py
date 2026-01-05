"""Candidate selection utilities."""

from __future__ import annotations

import logging
from typing import Dict, Iterable, Optional, Tuple

from .calculations import basis_pct
from .chains import common_chain_pairs
from .models import BasisMode, MarketQuote, PremiumOpportunity, TransferStatus
from .transfers import bithumb_inout_statuses, gateio_currency_statuses

logger = logging.getLogger(__name__)


def select_candidate_coin(
    opportunities: Iterable[PremiumOpportunity],
    gateio_spot_quotes: Dict[str, MarketQuote],
    gateio_perp_quotes: Dict[str, MarketQuote],
    basis_threshold_pct: float,
    mode: BasisMode,
) -> Optional[str]:
    """Selects the first coin passing GateIO spot/perp basis constraints."""
    for opp in opportunities:
        coin = opp.coin
        spot_quote = gateio_spot_quotes.get(coin)
        perp_quote = gateio_perp_quotes.get(coin)
        if not spot_quote or not perp_quote or not spot_quote.is_valid() or not perp_quote.is_valid():
            continue

        if mode == "unwind":
            spot_price = spot_quote.bid  # spot market sell
            perp_price = perp_quote.ask  # perp market buy (cover)
        else:
            spot_price = spot_quote.ask  # spot market buy
            perp_price = perp_quote.bid  # perp market sell (short)

        if basis_pct(spot_price, perp_price) <= basis_threshold_pct:
            return coin
    return None


def select_transferable_candidate_coin(
    opportunities: Iterable[PremiumOpportunity],
    gateio_spot_quotes: Dict[str, MarketQuote],
    gateio_perp_quotes: Dict[str, MarketQuote],
    gate_spot,
    basis_threshold_pct: float,
    mode: BasisMode,
) -> Optional[Tuple[str, TransferStatus, TransferStatus, Tuple[Tuple[str, str], ...]]]:
    """Selects a candidate coin passing basis + transfer constraints."""
    basis_ok: list[str] = []
    for opp in opportunities:
        coin = opp.coin
        spot_quote = gateio_spot_quotes.get(coin)
        perp_quote = gateio_perp_quotes.get(coin)
        if not spot_quote or not perp_quote or not spot_quote.is_valid() or not perp_quote.is_valid():
            continue

        if mode == "unwind":
            spot_price = spot_quote.bid  # spot market sell
            perp_price = perp_quote.ask  # perp market buy (cover)
        else:
            spot_price = spot_quote.ask  # spot market buy
            perp_price = perp_quote.bid  # perp market sell (short)

        if basis_pct(spot_price, perp_price) <= basis_threshold_pct:
            basis_ok.append(coin)

    if not basis_ok:
        return None

    b_statuses = bithumb_inout_statuses(basis_ok)
    g_statuses = gateio_currency_statuses(gate_spot, basis_ok)

    for coin in basis_ok:
        b_status = b_statuses[coin]
        g_status = g_statuses[coin]
        if not (b_status.deposit_ok is True and b_status.withdraw_ok is True):
            logger.warning(
                "후보 제외(%s): Bithumb deposit=%s withdraw=%s",
                coin,
                b_status.deposit_ok,
                b_status.withdraw_ok,
            )
            continue
        if not (g_status.deposit_ok is True and g_status.withdraw_ok is True):
            logger.warning(
                "후보 제외(%s): GateIO deposit=%s withdraw=%s",
                coin,
                g_status.deposit_ok,
                g_status.withdraw_ok,
            )
            continue

        chain_pairs = common_chain_pairs(b_status.chains, g_status.chains)
        if not chain_pairs:
            logger.warning(
                "후보 제외(%s): 공통 체인 없음 (Bithumb=%s, GateIO=%s)",
                coin,
                b_status.chains,
                g_status.chains,
            )
            continue

        return coin, b_status, g_status, chain_pairs

    return None
