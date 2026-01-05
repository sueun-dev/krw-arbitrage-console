"""Datamodels used by the arbitrage module."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Optional, Tuple

Direction = Literal["reverse", "kimchi"]
BasisMode = Literal["entry", "unwind"]


@dataclass(frozen=True)
class MarketQuote:
    """Best bid/ask snapshot for a symbol."""

    bid: float
    ask: float

    def is_valid(self) -> bool:
        return self.bid > 0 and self.ask > 0


@dataclass(frozen=True)
class PremiumOpportunity:
    """Premium opportunity computed in percent (+ means domestic > overseas)."""

    coin: str
    direction: Direction
    premium_pct: float
    domestic_price: float
    overseas_price: float
    usdt_krw: float


@dataclass(frozen=True)
class ChainInfo:
    """Deposit/withdraw metadata per chain."""

    name: str
    deposit_ok: Optional[bool]
    withdraw_ok: Optional[bool]
    confirmations: Optional[int]


@dataclass(frozen=True)
class TransferStatus:
    """Deposit/withdraw availability + chain list (best-effort)."""

    exchange: str
    coin: str
    deposit_ok: Optional[bool]
    withdraw_ok: Optional[bool]
    chains: Tuple[str, ...]
    chain_info: Tuple[ChainInfo, ...] = ()
