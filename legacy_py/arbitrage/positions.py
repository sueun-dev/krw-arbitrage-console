"""Position helpers."""

from __future__ import annotations

import ccxt


def gateio_perp_short_qty(perp: ccxt.Exchange, coin: str) -> float:
    """Best-effort: returns absolute short position size in base units."""
    coin_upper = coin.upper()
    try:
        positions = perp.fetch_positions()
    except Exception:
        return 0.0

    for pos in positions or []:
        symbol = (pos.get("symbol") or "").upper()
        if coin_upper not in symbol:
            continue
        contracts = pos.get("contracts")
        size = pos.get("size")
        contract_size = float(pos.get("contractSize") or 1.0)
        side = (pos.get("side") or "").lower()

        if contracts not in (None, 0):
            qty = abs(float(contracts) * contract_size)
        elif size not in (None, 0):
            qty = abs(float(size))
        else:
            continue

        if side and side != "short":
            continue
        return qty

    return 0.0
