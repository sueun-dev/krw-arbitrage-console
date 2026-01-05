"""Unit tests for market data helpers."""

from __future__ import annotations

import pytest

from arbitrage.market_data import fee_adjusted_quote, quote_and_size_from_notional
from arbitrage.models import MarketQuote


class StubExchange:
    def __init__(self, orderbook: dict) -> None:
        self._orderbook = orderbook

    def fetch_order_book(self, symbol: str, limit: int | None = None) -> dict:
        return self._orderbook


def test_fee_adjusted_quote() -> None:
    quote = MarketQuote(bid=100.0, ask=110.0)
    adjusted = fee_adjusted_quote(quote, buy_fee_rate=0.01, sell_fee_rate=0.02)
    assert adjusted.bid == pytest.approx(98.0)
    assert adjusted.ask == pytest.approx(111.1)


def test_quote_and_size_from_notional_buy() -> None:
    orderbook = {
        "bids": [[10.0, 1.0], [9.0, 2.0]],
        "asks": [[10.0, 1.0], [11.0, 2.0]],
    }
    exchange = StubExchange(orderbook)
    result = quote_and_size_from_notional(exchange, "FOO/USDT", 21.0, side="buy", depth=5)
    assert result is not None
    quote, base_qty = result
    assert base_qty == pytest.approx(2.0)
    assert quote.ask > 0


def test_quote_and_size_from_notional_sell() -> None:
    orderbook = {
        "bids": [[10.0, 1.0], [9.0, 2.0]],
        "asks": [[11.0, 1.0], [12.0, 2.0]],
    }
    exchange = StubExchange(orderbook)
    result = quote_and_size_from_notional(exchange, "FOO/USDT", 19.0, side="sell", depth=5)
    assert result is not None
    quote, base_qty = result
    assert base_qty == pytest.approx(2.0)
    assert quote.bid > 0


def test_quote_and_size_from_notional_invalid_side() -> None:
    orderbook = {"bids": [[10.0, 1.0]], "asks": [[11.0, 1.0]]}
    exchange = StubExchange(orderbook)
    with pytest.raises(ValueError):
        quote_and_size_from_notional(exchange, "FOO/USDT", 10.0, side="hold", depth=5)
