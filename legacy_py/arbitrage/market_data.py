"""Market data helpers for quotes and orderbook-based pricing."""

from __future__ import annotations

from typing import Dict, Optional, Tuple

import ccxt

from .calculations import apply_fee
from .models import MarketQuote
from .orderbook import estimate_fill_from_quote, quote_from_orderbook


def fetch_quote(exchange: ccxt.Exchange, symbol: str) -> Optional[MarketQuote]:
    """Fetches best bid/ask for a symbol (ticker-first, orderbook fallback)."""
    try:
        ticker = exchange.fetch_ticker(symbol)
        bid = float(ticker.get("bid") or 0.0)
        ask = float(ticker.get("ask") or 0.0)
        if bid > 0 and ask > 0:
            return MarketQuote(bid=bid, ask=ask)
    except Exception:
        pass

    try:
        ob = exchange.fetch_order_book(symbol)
        bid = float(ob.get("bids", [[0, 0]])[0][0] or 0.0)
        ask = float(ob.get("asks", [[0, 0]])[0][0] or 0.0)
        if bid > 0 and ask > 0:
            return MarketQuote(bid=bid, ask=ask)
    except Exception:
        return None
    return None


def fetch_quotes_by_base(exchange: ccxt.Exchange, symbols_by_base: Dict[str, str]) -> Dict[str, MarketQuote]:
    """Fetches quotes for a base->symbol mapping."""
    out: Dict[str, MarketQuote] = {}
    for base, symbol in symbols_by_base.items():
        quote = fetch_quote(exchange, symbol)
        if quote:
            out[base] = quote
    return out


def fetch_orderbook(exchange: ccxt.Exchange, symbol: str, depth: int = 20) -> Optional[dict]:
    """Fetches orderbook for a symbol."""
    try:
        return exchange.fetch_order_book(symbol, limit=depth)
    except Exception:
        return None


def fetch_vwap_quote(
    exchange: ccxt.Exchange,
    symbol: str,
    base_qty: float,
    depth: int = 20,
) -> Optional[MarketQuote]:
    """Fetches VWAP bid/ask quote for a base quantity."""
    orderbook = fetch_orderbook(exchange, symbol, depth=depth)
    if not orderbook:
        return None
    return quote_from_orderbook(orderbook, base_qty)


def fetch_vwap_quotes_by_base(
    exchange: ccxt.Exchange,
    symbols_by_base: Dict[str, str],
    base_qty_by_base: Dict[str, float],
    depth: int = 20,
) -> Dict[str, MarketQuote]:
    """Fetches VWAP quotes using per-coin base quantities."""
    out: Dict[str, MarketQuote] = {}
    for base, symbol in symbols_by_base.items():
        base_qty = base_qty_by_base.get(base)
        if not base_qty or base_qty <= 0:
            continue
        quote = fetch_vwap_quote(exchange, symbol, base_qty, depth=depth)
        if quote:
            out[base] = quote
    return out


def fee_adjusted_quote(
    quote: MarketQuote,
    buy_fee_rate: float,
    sell_fee_rate: float,
) -> MarketQuote:
    """Returns a fee-adjusted quote using taker fees."""
    return MarketQuote(
        bid=apply_fee(quote.bid, sell_fee_rate, "sell"),
        ask=apply_fee(quote.ask, buy_fee_rate, "buy"),
    )


def quote_and_size_from_notional(
    exchange: ccxt.Exchange,
    symbol: str,
    quote_amount: float,
    side: str,
    depth: int = 20,
) -> Optional[Tuple[MarketQuote, float]]:
    """Returns (raw VWAP quote, base_qty) sized from a quote notional."""
    orderbook = fetch_orderbook(exchange, symbol, depth=depth)
    if not orderbook:
        return None
    if side not in {"buy", "sell"}:
        raise ValueError("side must be 'buy' or 'sell'")

    levels = orderbook.get("bids", []) if side == "sell" else orderbook.get("asks", [])
    fill = estimate_fill_from_quote(levels, quote_amount)
    if not fill:
        return None

    base_qty, _ = fill
    quote = quote_from_orderbook(orderbook, base_qty)
    if not quote:
        return None
    return quote, base_qty
