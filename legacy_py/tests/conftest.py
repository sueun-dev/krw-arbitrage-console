"""Pytest configuration for legacy `arbitrage` package imports."""

from __future__ import annotations

import sys
from pathlib import Path

LEGACY_ROOT = Path(__file__).resolve().parents[1]  # legacy_py/
if str(LEGACY_ROOT) not in sys.path:
    sys.path.insert(0, str(LEGACY_ROOT))
