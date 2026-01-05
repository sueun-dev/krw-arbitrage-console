"""Orderbook-based price estimation utilities."""

from __future__ import annotations

from typing import Iterable, Optional, Tuple

from .models import MarketQuote

Level = Tuple[float, float]


def _normalize_levels(levels: Iterable[Iterable[float]]) -> list[Level]:
    out: list[Level] = []
    for row in levels:
        try:
            price = float(row[0])
            amount = float(row[1])
        except (TypeError, ValueError, IndexError):
            continue
        if price > 0 and amount > 0:
            out.append((price, amount))
    return out


def estimate_fill_from_base(levels: Iterable[Iterable[float]], base_qty: float) -> Optional[float]:
    """Returns VWAP price for a base-quantity market fill."""
    if base_qty <= 0:
        return None

    remaining = base_qty
    cost = 0.0
    for price, amount in _normalize_levels(levels):
        take = min(amount, remaining)
        cost += price * take
        remaining -= take
        if remaining <= 1e-12:
            break

    if remaining > 1e-12:
        return None
    return cost / base_qty


def estimate_fill_from_quote(
    levels: Iterable[Iterable[float]],
    quote_amount: float,
) -> Optional[Tuple[float, float]]:
    """Returns (base_qty, VWAP price) for a quote-notional market fill."""
    if quote_amount <= 0:
        return None

    remaining = quote_amount
    base_qty = 0.0
    cost = 0.0
    for price, amount in _normalize_levels(levels):
        level_cost = price * amount
        if level_cost <= remaining:
            base_qty += amount
            cost += level_cost
            remaining -= level_cost
        else:
            partial = remaining / price
            base_qty += partial
            cost += remaining
            remaining = 0.0
            break

    if remaining > 1e-12 or base_qty <= 0:
        return None
    return base_qty, cost / base_qty


def quote_from_orderbook(orderbook: dict, base_qty: float) -> Optional[MarketQuote]:
    """Builds a MarketQuote (bid/ask VWAP) for a base quantity."""
    bids = orderbook.get("bids", []) if isinstance(orderbook, dict) else []
    asks = orderbook.get("asks", []) if isinstance(orderbook, dict) else []

    bid_price = estimate_fill_from_base(bids, base_qty)
    ask_price = estimate_fill_from_base(asks, base_qty)
    if not bid_price or not ask_price:
        return None
    return MarketQuote(bid=bid_price, ask=ask_price)
