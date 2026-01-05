"""Dependency bootstrap for shared modules."""

from __future__ import annotations

import sys
from pathlib import Path


def ensure_overseas_exchange_hedge_on_path() -> None:
    here = Path(__file__).resolve()
    # Layouts supported:
    # - Original: <repo_root>/arbitrage/bootstrap.py with sibling <repo_root>/../overseas_exchange_hedge/src
    # - Legacy:   <repo_root>/legacy_py/arbitrage/bootstrap.py with sibling <repo_root>/../overseas_exchange_hedge/src
    repo_root = here.parents[2]
    candidate = repo_root.parent / "overseas_exchange_hedge" / "src"
    if candidate.is_dir() and str(candidate) not in sys.path:
        sys.path.insert(0, str(candidate))

    try:
        import overseas_exchange_hedge.overseas  # noqa: F401
    except Exception as exc:
        raise RuntimeError(
            "Missing dependency: overseas_exchange_hedge. "
            "Set PYTHONPATH to its src/ or install the package."
        ) from exc
