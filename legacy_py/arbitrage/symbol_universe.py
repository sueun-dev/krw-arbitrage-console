"""Symbol universe cache and discovery."""

from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Optional, Tuple

import ccxt

from .bootstrap import ensure_overseas_exchange_hedge_on_path

ensure_overseas_exchange_hedge_on_path()

from overseas_exchange_hedge.overseas.exchange_manager import ExchangeManager

logger = logging.getLogger(__name__)

_RUNTIME_DIR_ENV = "OEH_RUNTIME_DIR"
_SYMBOL_CACHE_VERSION = 1
_SYMBOL_CACHE_FILENAME = "arbitrage_symbols.json"
_DEFAULT_SYMBOL_CACHE_MAX_AGE_SECONDS = 60 * 60 * 24


@dataclass(frozen=True)
class ArbitrageSymbolUniverse:
    updated_at_ts: int
    bithumb_krw_symbols: Dict[str, str]
    gateio_spot_symbols: Dict[str, str]
    gateio_perp_symbols: Dict[str, str]
    reverse_candidates: list[str]
    kimchi_candidates: list[str]

    def age_seconds(self) -> float:
        return max(0.0, time.time() - float(self.updated_at_ts))


def _symbol_cache_path() -> Path:
    runtime_dir = Path(os.getenv(_RUNTIME_DIR_ENV, "runtime")).expanduser()
    cache_dir = runtime_dir / "cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir / _SYMBOL_CACHE_FILENAME


def load_arbitrage_symbol_universe(
    max_age_seconds: int = _DEFAULT_SYMBOL_CACHE_MAX_AGE_SECONDS,
) -> Optional[ArbitrageSymbolUniverse]:
    path = _symbol_cache_path()
    try:
        with path.open("r", encoding="utf-8") as f:
            payload = json.load(f)
    except FileNotFoundError:
        return None
    except Exception:
        return None

    if not isinstance(payload, dict):
        return None
    if payload.get("schema_version") != _SYMBOL_CACHE_VERSION:
        return None

    try:
        updated_at_ts = int(payload.get("updated_at_ts") or 0)
    except Exception:
        return None
    if updated_at_ts <= 0:
        return None
    if max_age_seconds > 0 and (time.time() - updated_at_ts) > max_age_seconds:
        return None

    def _parse_str_str_map(key: str) -> Optional[Dict[str, str]]:
        value = payload.get(key)
        if not isinstance(value, dict):
            return None
        out: Dict[str, str] = {}
        for k, v in value.items():
            if isinstance(k, str) and isinstance(v, str):
                out[k] = v
        return out or None

    def _parse_str_list(key: str) -> Optional[list[str]]:
        value = payload.get(key)
        if not isinstance(value, list):
            return None
        out = [x for x in value if isinstance(x, str)]
        return out

    bithumb_symbols = _parse_str_str_map("bithumb_krw_symbols")
    gateio_spot_symbols = _parse_str_str_map("gateio_spot_symbols")
    gateio_perp_symbols = _parse_str_str_map("gateio_perp_symbols")
    if not bithumb_symbols or not gateio_spot_symbols or not gateio_perp_symbols:
        return None

    reverse_candidates = _parse_str_list("reverse_candidates")
    kimchi_candidates = _parse_str_list("kimchi_candidates")

    if reverse_candidates is None:
        reverse_candidates = sorted(set(bithumb_symbols) & set(gateio_perp_symbols))
    else:
        reverse_candidates = [c for c in reverse_candidates if c in bithumb_symbols and c in gateio_perp_symbols]

    if kimchi_candidates is None:
        kimchi_candidates = sorted(set(bithumb_symbols) & set(gateio_perp_symbols) & set(gateio_spot_symbols))
    else:
        kimchi_candidates = [
            c
            for c in kimchi_candidates
            if c in bithumb_symbols and c in gateio_perp_symbols and c in gateio_spot_symbols
        ]

    return ArbitrageSymbolUniverse(
        updated_at_ts=updated_at_ts,
        bithumb_krw_symbols=bithumb_symbols,
        gateio_spot_symbols=gateio_spot_symbols,
        gateio_perp_symbols=gateio_perp_symbols,
        reverse_candidates=reverse_candidates,
        kimchi_candidates=kimchi_candidates,
    )


def _save_arbitrage_symbol_universe(universe: ArbitrageSymbolUniverse) -> Path:
    path = _symbol_cache_path()
    tmp = path.with_suffix(".tmp")

    payload = {
        "schema_version": _SYMBOL_CACHE_VERSION,
        "updated_at_ts": universe.updated_at_ts,
        "bithumb_krw_symbols": universe.bithumb_krw_symbols,
        "gateio_spot_symbols": universe.gateio_spot_symbols,
        "gateio_perp_symbols": universe.gateio_perp_symbols,
        "reverse_candidates": universe.reverse_candidates,
        "kimchi_candidates": universe.kimchi_candidates,
    }

    with tmp.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2, sort_keys=True)
        f.write("\n")
    tmp.replace(path)
    return path


def refresh_arbitrage_symbol_universe(
    bithumb: ccxt.Exchange,
    gateio_mgr: ExchangeManager,
) -> ArbitrageSymbolUniverse:
    bithumb_symbols = bithumb_krw_symbols(bithumb)
    gateio_spot_symbols, gateio_perp_symbols = gateio_spot_and_perp_symbols(gateio_mgr)

    reverse_candidates = sorted(set(bithumb_symbols) & set(gateio_perp_symbols))
    kimchi_candidates = sorted(set(bithumb_symbols) & set(gateio_perp_symbols) & set(gateio_spot_symbols))

    universe = ArbitrageSymbolUniverse(
        updated_at_ts=int(time.time()),
        bithumb_krw_symbols=bithumb_symbols,
        gateio_spot_symbols=gateio_spot_symbols,
        gateio_perp_symbols=gateio_perp_symbols,
        reverse_candidates=reverse_candidates,
        kimchi_candidates=kimchi_candidates,
    )
    _save_arbitrage_symbol_universe(universe)
    return universe


def get_arbitrage_symbol_universe(
    bithumb: ccxt.Exchange,
    gateio_mgr: ExchangeManager,
    max_age_seconds: int = _DEFAULT_SYMBOL_CACHE_MAX_AGE_SECONDS,
    force_refresh: bool = False,
) -> ArbitrageSymbolUniverse:
    if not force_refresh:
        cached = load_arbitrage_symbol_universe(max_age_seconds=max_age_seconds)
        if cached:
            logger.info("📦 symbols cache hit (age=%.1fh): %s", cached.age_seconds() / 3600.0, _symbol_cache_path())
            return cached

    logger.info("🔄 symbols cache refresh: %s", _symbol_cache_path())
    universe = refresh_arbitrage_symbol_universe(bithumb, gateio_mgr)
    logger.info(
        "✅ symbols cached (reverse=%s, kimchi=%s)",
        len(universe.reverse_candidates),
        len(universe.kimchi_candidates),
    )
    return universe


def bithumb_krw_symbols(bithumb: ccxt.Exchange) -> Dict[str, str]:
    """Returns mapping base->symbol for KRW markets."""
    symbols: Dict[str, str] = {}
    for symbol, market in (bithumb.markets or {}).items():
        if not market or market.get("active") is False:
            continue
        if market.get("quote") != "KRW":
            continue
        base = market.get("base")
        if not base or base.upper() in {"KRW"}:
            continue
        symbols[str(base).upper()] = symbol
    return symbols


def gateio_symbols_by_base(exchange: ccxt.Exchange) -> Dict[str, str]:
    """Returns mapping base->symbol for a pre-loaded GateIO market set."""
    symbols: Dict[str, str] = {}
    for symbol, market in (exchange.markets or {}).items():
        if not market or market.get("active") is False:
            continue
        base = market.get("base")
        quote = market.get("quote")
        if not base or quote != "USDT":
            continue
        symbols[str(base).upper()] = symbol
    return symbols


def gateio_spot_and_perp_symbols(gateio_mgr: ExchangeManager) -> Tuple[Dict[str, str], Dict[str, str]]:
    """Loads all GateIO markets and returns (spot_symbols, perp_symbols)."""
    ex_pair = gateio_mgr.get_exchange("gateio")
    if not ex_pair:
        raise RuntimeError("GateIO exchange not initialized")

    spot = ex_pair["spot"]
    perp = ex_pair["perp"]
    spot.load_markets()
    perp.load_markets()

    spot_symbols: Dict[str, str] = {}
    for symbol, market in (spot.markets or {}).items():
        if not market or market.get("active") is False:
            continue
        if market.get("spot") is False:
            continue
        if market.get("quote") != "USDT":
            continue
        base = market.get("base")
        if base:
            spot_symbols[str(base).upper()] = symbol

    perp_symbols: Dict[str, str] = {}
    for symbol, market in (perp.markets or {}).items():
        if not market or market.get("active") is False:
            continue
        if not (market.get("swap") or market.get("future")):
            continue
        if market.get("quote") != "USDT":
            continue
        settle = market.get("settle")
        if settle and str(settle).upper() != "USDT":
            continue
        base = market.get("base")
        if base:
            perp_symbols[str(base).upper()] = symbol

    return spot_symbols, perp_symbols
