"""Unit tests for orderbook VWAP calculations."""

from __future__ import annotations

import pytest

from arbitrage.orderbook import estimate_fill_from_base, estimate_fill_from_quote, quote_from_orderbook


def test_estimate_fill_from_base() -> None:
    levels = [(10.0, 1.0), (11.0, 2.0)]
    price = estimate_fill_from_base(levels, 2.5)
    assert price == pytest.approx(10.6)


def test_estimate_fill_from_base_insufficient() -> None:
    levels = [(10.0, 1.0)]
    assert estimate_fill_from_base(levels, 2.0) is None


def test_estimate_fill_from_quote() -> None:
    levels = [(10.0, 1.0), (11.0, 2.0)]
    result = estimate_fill_from_quote(levels, 21.0)
    assert result is not None
    base_qty, price = result
    assert base_qty == pytest.approx(2.0)
    assert price == pytest.approx(10.5)


def test_quote_from_orderbook() -> None:
    orderbook = {
        "bids": [[10.0, 1.0], [9.0, 2.0]],
        "asks": [[11.0, 1.0], [12.0, 2.0]],
    }
    quote = quote_from_orderbook(orderbook, 2.0)
    assert quote is not None
    assert quote.bid == pytest.approx(9.5)
    assert quote.ask == pytest.approx(11.5)
