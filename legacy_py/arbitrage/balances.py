"""Balance helpers."""

from __future__ import annotations

import ccxt


def gateio_spot_balance(spot: ccxt.Exchange, coin: str) -> float:
    try:
        bal = spot.fetch_balance()
        entry = bal.get(coin.upper(), {}) if isinstance(bal, dict) else {}
        free = float(entry.get("free") or 0.0)
        total = float(entry.get("total") or 0.0)
        return total if total > 0 else free
    except Exception:
        return 0.0


def bithumb_spot_balance(bithumb: ccxt.Exchange, coin: str) -> float:
    try:
        bal = bithumb.fetch_balance()
        entry = bal.get(coin.upper(), {}) if isinstance(bal, dict) else {}
        free = float(entry.get("free") or 0.0)
        total = float(entry.get("total") or 0.0)
        return total if total > 0 else free
    except Exception:
        return 0.0
