"""Pure calculations for arbitrage scanning/validation."""

from __future__ import annotations


def premium_pct(domestic_price_krw: float, overseas_price_usdt: float, usdt_krw: float) -> float:
    """Calculates premium in percent: (domestic - overseas_krw) / overseas_krw * 100.

    Args:
        domestic_price_krw: Domestic execution price in KRW (e.g. Bithumb bid/ask).
        overseas_price_usdt: Overseas execution price in USDT (e.g. GateIO bid/ask).
        usdt_krw: KRW per USDT (assumed 0% USDT premium baseline).

    Returns:
        Premium in percent (negative means reverse premium).
    """
    if domestic_price_krw <= 0:
        raise ValueError("domestic_price_krw must be > 0")
    if overseas_price_usdt <= 0:
        raise ValueError("overseas_price_usdt must be > 0")
    if usdt_krw <= 0:
        raise ValueError("usdt_krw must be > 0")

    overseas_krw = overseas_price_usdt * usdt_krw
    return (domestic_price_krw - overseas_krw) / overseas_krw * 100.0


def apply_fee(price: float, fee_rate: float, side: str) -> float:
    """Returns fee-adjusted execution price for a buy or sell."""
    if price <= 0:
        raise ValueError("price must be > 0")
    if fee_rate < 0:
        raise ValueError("fee_rate must be >= 0")
    if side == "buy":
        return price * (1.0 + fee_rate)
    if side == "sell":
        return price * (1.0 - fee_rate)
    raise ValueError("side must be 'buy' or 'sell'")


def basis_pct(spot_exec_price: float, perp_exec_price: float) -> float:
    """Calculates spot-perp basis in percent: |perp - spot| / spot * 100."""
    if spot_exec_price <= 0:
        raise ValueError("spot_exec_price must be > 0")
    if perp_exec_price <= 0:
        raise ValueError("perp_exec_price must be > 0")
    return abs(perp_exec_price - spot_exec_price) / spot_exec_price * 100.0


def mid_price(bid: float, ask: float) -> float:
    """Returns a robust mid price for a market."""
    if bid > 0 and ask > 0:
        return (bid + ask) / 2.0
    if bid > 0:
        return bid
    if ask > 0:
        return ask
    return 0.0
