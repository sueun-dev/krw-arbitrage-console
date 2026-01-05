"""Unit tests for pure calculation helpers."""

from __future__ import annotations

import pytest

from arbitrage.calculations import apply_fee, basis_pct, mid_price, premium_pct


def test_premium_pct_positive() -> None:
    assert premium_pct(105.0, 1.0, 100.0) == pytest.approx(5.0)


def test_premium_pct_negative() -> None:
    assert premium_pct(95.0, 1.0, 100.0) == pytest.approx(-5.0)


def test_premium_pct_invalid() -> None:
    with pytest.raises(ValueError):
        premium_pct(0.0, 1.0, 100.0)


def test_apply_fee_buy_sell() -> None:
    assert apply_fee(100.0, 0.001, "buy") == pytest.approx(100.1)
    assert apply_fee(100.0, 0.001, "sell") == pytest.approx(99.9)


def test_apply_fee_invalid_side() -> None:
    with pytest.raises(ValueError):
        apply_fee(100.0, 0.001, "hold")


def test_basis_pct() -> None:
    assert basis_pct(100.0, 110.0) == pytest.approx(10.0)


def test_mid_price() -> None:
    assert mid_price(99.0, 101.0) == pytest.approx(100.0)
    assert mid_price(99.0, 0.0) == pytest.approx(99.0)
