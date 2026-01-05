"""Exchange adapter facade for the arbitrage module."""

from __future__ import annotations

from .balances import bithumb_spot_balance, gateio_spot_balance
from .chains import common_chain_pairs, common_chains, normalize_chain_name
from .exchange_clients import create_bithumb, create_gateio_context
from .market_data import fetch_quote, fetch_quotes_by_base
from .positions import gateio_perp_short_qty
from .rates import usdt_krw_rate
from .symbol_universe import (
    ArbitrageSymbolUniverse,
    bithumb_krw_symbols,
    gateio_spot_and_perp_symbols,
    gateio_symbols_by_base,
    get_arbitrage_symbol_universe,
    load_arbitrage_symbol_universe,
    refresh_arbitrage_symbol_universe,
)
from .trading import bithumb_market_buy_base, bithumb_market_sell_base
from .transfers import (
    bithumb_inout_status,
    bithumb_inout_statuses,
    gateio_currency_status,
    gateio_currency_statuses,
)

__all__ = [
    "ArbitrageSymbolUniverse",
    "bithumb_krw_symbols",
    "bithumb_inout_status",
    "bithumb_inout_statuses",
    "bithumb_market_buy_base",
    "bithumb_market_sell_base",
    "bithumb_spot_balance",
    "common_chain_pairs",
    "common_chains",
    "create_bithumb",
    "create_gateio_context",
    "fetch_quote",
    "fetch_quotes_by_base",
    "gateio_currency_status",
    "gateio_currency_statuses",
    "gateio_perp_short_qty",
    "gateio_spot_and_perp_symbols",
    "gateio_spot_balance",
    "gateio_symbols_by_base",
    "get_arbitrage_symbol_universe",
    "load_arbitrage_symbol_universe",
    "normalize_chain_name",
    "refresh_arbitrage_symbol_universe",
    "usdt_krw_rate",
]
