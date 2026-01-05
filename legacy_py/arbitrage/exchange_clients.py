"""Exchange client constructors."""

from __future__ import annotations

import os
from typing import Any, Dict, Tuple

import ccxt

from .bootstrap import ensure_overseas_exchange_hedge_on_path

ensure_overseas_exchange_hedge_on_path()

from overseas_exchange_hedge.overseas.exchange_manager import ExchangeManager
from overseas_exchange_hedge.overseas.trade_executor import TradeExecutor


def _get_env(*names: str) -> str:
    for name in names:
        value = os.getenv(name)
        if value:
            return value
    return ""


def create_bithumb(require_keys: bool) -> ccxt.Exchange:
    """Creates a Bithumb ccxt client."""
    api_key = _get_env("BITHUMB_API_KEY")
    secret = _get_env("BITHUMB_API_SECRET", "BITHUMB_SECRET_KEY")
    if require_keys and not (api_key and secret):
        raise RuntimeError("Missing Bithumb API keys (BITHUMB_API_KEY / BITHUMB_API_SECRET).")

    params: Dict[str, Any] = {"enableRateLimit": True}
    if api_key and secret:
        params.update({"apiKey": api_key, "secret": secret})
    ex = ccxt.bithumb(params)
    ex.load_markets()
    return ex


def create_gateio_context(use_public_api: bool) -> Tuple[ExchangeManager, TradeExecutor]:
    """Creates an ExchangeManager+TradeExecutor pair limited to GateIO."""
    mgr = ExchangeManager()
    mgr.initialize_exchanges(use_public_api=use_public_api, allowed_exchanges={"gateio"})
    return mgr, TradeExecutor(mgr)
