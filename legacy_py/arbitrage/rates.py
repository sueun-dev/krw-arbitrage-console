"""Exchange rate helpers."""

from __future__ import annotations

import os
from typing import Any, Dict

import ccxt
import requests

from .calculations import mid_price

_RATE_SOURCE_ENV = "USDT_KRW_RATE_SOURCE"
_RATE_OVERRIDE_ENV = "USDT_KRW_RATE_OVERRIDE"

_RATE_SOURCE_LABELS: Dict[str, str] = {
    "fx_usd_krw": "USD/KRW FX (USDT≈USD)",
    "bithumb_usdt": "Bithumb USDT/KRW",
    "upbit_usdt": "Upbit USDT/KRW",
    "custom": "Custom override",
}


def _resolve_rate_source(source: str | None) -> str:
    value = (source or os.getenv(_RATE_SOURCE_ENV, "fx_usd_krw")).strip().lower()
    aliases = {
        "fx": "fx_usd_krw",
        "usdkrw": "fx_usd_krw",
        "usd_krw": "fx_usd_krw",
        "theddari": "fx_usd_krw",
        "fx_usd_krw": "fx_usd_krw",
        "bithumb": "bithumb_usdt",
        "bithumb_usdt": "bithumb_usdt",
        "upbit": "upbit_usdt",
        "upbit_usdt": "upbit_usdt",
        "custom": "custom",
    }
    resolved = aliases.get(value)
    if not resolved:
        raise ValueError(f"Unsupported USDT/KRW rate source: {value}")
    return resolved


def usdt_krw_rate_source(source: str | None = None) -> str:
    """Returns canonical USDT/KRW rate source key."""
    return _resolve_rate_source(source)


def usdt_krw_rate_label(source: str | None = None) -> str:
    """Returns a human-friendly label for the selected rate source."""
    resolved = _resolve_rate_source(source)
    return _RATE_SOURCE_LABELS.get(resolved, resolved)


def _fetch_bithumb_usdt_krw(bithumb: ccxt.Exchange) -> float:
    ticker = bithumb.fetch_ticker("USDT/KRW")
    bid = float(ticker.get("bid") or 0.0)
    ask = float(ticker.get("ask") or 0.0)
    last = float(ticker.get("last") or 0.0)
    rate = mid_price(bid, ask) or last
    if rate <= 0:
        raise RuntimeError("Failed to fetch USDT/KRW rate from Bithumb")
    return rate


def _fetch_upbit_usdt_krw() -> float:
    url = "https://api.upbit.com/v1/ticker?markets=KRW-USDT"
    try:
        resp = requests.get(url, timeout=5)
        resp.raise_for_status()
        payload = resp.json()
    except Exception as exc:
        raise RuntimeError(f"Failed to fetch USDT/KRW rate from Upbit: {exc}") from exc

    if not payload:
        raise RuntimeError("Empty Upbit ticker payload for KRW-USDT")

    first = payload[0] if isinstance(payload, list) else payload
    price = float(first.get("trade_price") or 0.0)
    if price <= 0:
        raise RuntimeError("Invalid Upbit USDT/KRW trade_price")
    return price


def _fetch_fx_usd_krw() -> float:
    url = "https://open.er-api.com/v6/latest/USD"
    try:
        resp = requests.get(url, timeout=5)
        resp.raise_for_status()
        payload: Dict[str, Any] = resp.json()
    except Exception as exc:
        raise RuntimeError(f"Failed to fetch USD/KRW FX rate: {exc}") from exc

    if payload.get("result") != "success":
        raise RuntimeError("USD/KRW FX payload not successful")

    rates = payload.get("rates") or {}
    value = float(rates.get("KRW") or 0.0)
    if value <= 0:
        raise RuntimeError("Invalid USD/KRW FX rate")
    return value


def _fetch_custom_rate() -> float:
    raw = os.getenv(_RATE_OVERRIDE_ENV, "").strip()
    try:
        value = float(raw)
    except ValueError as exc:
        raise RuntimeError(f"Invalid {_RATE_OVERRIDE_ENV} value: {raw}") from exc
    if value <= 0:
        raise RuntimeError(f"{_RATE_OVERRIDE_ENV} must be > 0")
    return value

def usdt_krw_rate(bithumb: ccxt.Exchange, source: str | None = None) -> float:
    """Gets USDT/KRW rate using the selected source."""
    resolved = _resolve_rate_source(source)
    if resolved == "fx_usd_krw":
        return _fetch_fx_usd_krw()
    if resolved == "upbit_usdt":
        return _fetch_upbit_usdt_krw()
    if resolved == "bithumb_usdt":
        return _fetch_bithumb_usdt_krw(bithumb)
    if resolved == "custom":
        return _fetch_custom_rate()
    raise RuntimeError(f"Unsupported USDT/KRW rate source: {resolved}")
