"""Transfer ETA helpers (best-effort, chain-based)."""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Iterable, List, Optional, Tuple

from .chains import normalize_chain_name
from .models import TransferStatus

_CHAIN_BLOCK_SECONDS = {
    "ADA": 20,
    "ARBONE": 2,
    "ARBNOVA": 2,
    "ATOM": 6,
    "AVAXC": 2,
    "BASE": 2,
    "BCH": 600,
    "BEP20": 3,
    "BTC": 600,
    "DOGE": 60,
    "DOT": 6,
    "ERC20": 12,
    "ETC": 13,
    "LTC": 150,
    "MATIC": 2,
    "NEAR": 1,
    "OP": 2,
    "SOL": 1,
    "TRC20": 3,
    "XLM": 5,
    "XRP": 4,
}


def estimate_minutes(chain_name: str, confirmations: Optional[int]) -> Optional[int]:
    """Estimates minutes for a chain confirmation window.

    Args:
        chain_name: Chain name from exchange metadata.
        confirmations: Required confirmation count, if known.

    Returns:
        Estimated minutes or None if no chain timing is known.
    """
    canonical = normalize_chain_name(chain_name)
    block_seconds = _CHAIN_BLOCK_SECONDS.get(canonical)
    if not block_seconds:
        return None
    conf = confirmations if confirmations and confirmations > 0 else 1
    return max(1, int(math.ceil(block_seconds * conf / 60.0)))


@dataclass(frozen=True)
class TransferEta:
    """Structured ETA details for a chain pair."""

    canonical_chain: str
    bithumb_chain: str
    gateio_chain: str
    receive_label: str
    confirmations: Optional[int]
    minutes: Optional[int]


def build_transfer_eta_entries(
    chain_pairs: Iterable[Tuple[str, str]],
    bithumb_status: TransferStatus,
    gateio_status: TransferStatus,
    direction: str,
) -> List[TransferEta]:
    """Builds ETA entries for chain pairs.

    Args:
        chain_pairs: Common chain pairs (bithumb_chain, gateio_chain).
        bithumb_status: Transfer status from Bithumb.
        gateio_status: Transfer status from GateIO.
        direction: "bithumb_to_gateio" or "gateio_to_bithumb".

    Returns:
        List of structured ETA entries for console output.
    """
    if direction not in {"bithumb_to_gateio", "gateio_to_bithumb"}:
        raise ValueError("direction must be 'bithumb_to_gateio' or 'gateio_to_bithumb'")

    if direction == "bithumb_to_gateio":
        receive_status = gateio_status
        receive_label = "GateIO"
        receive_chain = lambda b_chain, g_chain: g_chain
    else:
        receive_status = bithumb_status
        receive_label = "Bithumb"
        receive_chain = lambda b_chain, g_chain: b_chain

    entries: List[TransferEta] = []
    for bithumb_chain, gateio_chain in chain_pairs:
        recv_chain = receive_chain(bithumb_chain, gateio_chain)
        confirmations = _confirmations_for_chain(receive_status, recv_chain)
        minutes = estimate_minutes(recv_chain, confirmations)

        canonical = normalize_chain_name(recv_chain) or recv_chain
        entries.append(
            TransferEta(
                canonical_chain=canonical,
                bithumb_chain=bithumb_chain,
                gateio_chain=gateio_chain,
                receive_label=receive_label,
                confirmations=confirmations,
                minutes=minutes,
            )
        )

    return entries


def _confirmations_for_chain(status: TransferStatus, chain_name: str) -> Optional[int]:
    if not status.chain_info:
        return None
    for info in status.chain_info:
        if info.name == chain_name:
            return info.confirmations

    target = normalize_chain_name(chain_name)
    for info in status.chain_info:
        if normalize_chain_name(info.name) == target:
            return info.confirmations

    return None
