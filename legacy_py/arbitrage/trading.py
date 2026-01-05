"""Trading helpers for Bithumb spot orders."""

from __future__ import annotations

import logging

import ccxt

from .bootstrap import ensure_overseas_exchange_hedge_on_path

ensure_overseas_exchange_hedge_on_path()

from overseas_exchange_hedge.common import utils
from overseas_exchange_hedge.overseas.trade_executor import _extract_filled_and_cost, _poll_fetch_order

logger = logging.getLogger(__name__)


def bithumb_market_buy_base(bithumb: ccxt.Exchange, symbol: str, base_amount: float, coin: str) -> float:
    """Executes a Bithumb spot market buy with a base quantity."""
    market = bithumb.markets.get(symbol) if hasattr(bithumb, "markets") else None
    qty = utils.round_to_precision(base_amount, market)
    if qty <= 0:
        raise ValueError("base_amount must be > 0")

    order = bithumb.create_order(symbol=symbol, type="market", side="buy", amount=qty)
    order_id = (order or {}).get("id") or ""
    if order_id:
        order = _poll_fetch_order(bithumb, order_id, symbol, fast=False)
    filled, cost = _extract_filled_and_cost(order, fallback_price=0.0)

    logger.info("✅ BITHUMB Spot Buy: %.8f %s (cost≈₩%s)", filled, coin, f"{cost:,.0f}")
    if filled <= 0:
        raise RuntimeError("Bithumb market buy produced 0 fill")
    return float(filled)


def bithumb_market_sell_base(bithumb: ccxt.Exchange, symbol: str, base_amount: float, coin: str) -> float:
    """Executes a Bithumb spot market sell with a base quantity."""
    market = bithumb.markets.get(symbol) if hasattr(bithumb, "markets") else None
    qty = utils.round_to_precision(base_amount, market)
    if qty <= 0:
        raise ValueError("base_amount must be > 0")

    order = bithumb.create_order(symbol=symbol, type="market", side="sell", amount=qty)
    order_id = (order or {}).get("id") or ""
    if order_id:
        order = _poll_fetch_order(bithumb, order_id, symbol, fast=False)
    filled, cost = _extract_filled_and_cost(order, fallback_price=0.0)

    logger.info("✅ BITHUMB Spot Sell: %.8f %s (proceeds≈₩%s)", filled, coin, f"{cost:,.0f}")
    if filled <= 0:
        raise RuntimeError("Bithumb market sell produced 0 fill")
    return float(filled)
