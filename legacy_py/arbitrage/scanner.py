"""Offline-friendly scanners and selection logic for arbitrage."""

from __future__ import annotations

from typing import Dict, List

from .calculations import premium_pct
from .models import MarketQuote, PremiumOpportunity
from .selection import select_candidate_coin


def compute_reverse_opportunities(
    bithumb_quotes: Dict[str, MarketQuote],
    gateio_perp_quotes: Dict[str, MarketQuote],
    usdt_krw: float,
    threshold_pct: float = -0.1,
) -> List[PremiumOpportunity]:
    """Finds reverse-premium opportunities (domestic cheaper than overseas).

    Notes:
      - Expects fee-adjusted quotes.
      - Domestic: market BUY => ask
      - Overseas: futures SHORT => market SELL => bid
    """
    opportunities: List[PremiumOpportunity] = []
    for coin, bithumb_quote in bithumb_quotes.items():
        perp_quote = gateio_perp_quotes.get(coin)
        if not perp_quote or not bithumb_quote.is_valid() or not perp_quote.is_valid():
            continue
        pct = premium_pct(bithumb_quote.ask, perp_quote.bid, usdt_krw)
        if pct <= threshold_pct:
            opportunities.append(
                PremiumOpportunity(
                    coin=coin,
                    direction="reverse",
                    premium_pct=pct,
                    domestic_price=bithumb_quote.ask,
                    overseas_price=perp_quote.bid,
                    usdt_krw=usdt_krw,
                )
            )
    opportunities.sort(key=lambda o: o.premium_pct)  # most negative first
    return opportunities


def compute_kimchi_opportunities(
    bithumb_quotes: Dict[str, MarketQuote],
    gateio_perp_quotes: Dict[str, MarketQuote],
    usdt_krw: float,
    threshold_pct: float = 0.0,
) -> List[PremiumOpportunity]:
    """Finds kimchi-premium opportunities (domestic more expensive than overseas).

    Notes:
      - Expects fee-adjusted quotes.
      - Domestic: market SELL => bid
      - Overseas: futures SHORT unwind => market BUY => ask
    """
    opportunities: List[PremiumOpportunity] = []
    for coin, bithumb_quote in bithumb_quotes.items():
        perp_quote = gateio_perp_quotes.get(coin)
        if not perp_quote or not bithumb_quote.is_valid() or not perp_quote.is_valid():
            continue
        pct = premium_pct(bithumb_quote.bid, perp_quote.ask, usdt_krw)
        if pct >= threshold_pct:
            opportunities.append(
                PremiumOpportunity(
                    coin=coin,
                    direction="kimchi",
                    premium_pct=pct,
                    domestic_price=bithumb_quote.bid,
                    overseas_price=perp_quote.ask,
                    usdt_krw=usdt_krw,
                )
            )
    opportunities.sort(key=lambda o: o.premium_pct, reverse=True)
    return opportunities


__all__ = [
    "compute_reverse_opportunities",
    "compute_kimchi_opportunities",
    "select_candidate_coin",
]
