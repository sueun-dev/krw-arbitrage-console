import os


# Capital used per cycle (USDT)
CAPITAL_USDT = float(os.getenv("CAPITAL_USDT", "3000"))

# Fee assumptions (taker)
BITHUMB_TAKER = float(os.getenv("BITHUMB_TAKER", "0.0004"))      # 0.04%
GATE_SPOT_TAKER = float(os.getenv("GATE_SPOT_TAKER", "0.002"))   # 0.20%
GATE_FUT_TAKER = float(os.getenv("GATE_FUT_TAKER", "0.0006"))    # 0.06% per side

# Execution mode (set to False to allow real orders)
DRY_RUN = os.getenv("DRY_RUN", "false").lower() in ("1", "true", "yes")

# Chunked order size (per leg, USD value) and max total per run
CHUNK_USDT = float(os.getenv("CHUNK_USDT", "50"))
MAX_TOTAL_USDT = float(os.getenv("MAX_TOTAL_USDT", "1000"))

# Withdrawal defaults (fill with your Gate deposit addresses)
WITHDRAW_NETWORK = os.getenv("WITHDRAW_NETWORK", "TRC20")
# Example: {"USDT": {"address": "YOUR_USDT_ADDRESS", "tag": None}}
WITHDRAW_TARGETS = {
    "USDT": {"address": "", "tag": None, "network": "TRC20"}
}

# API keys (set via env vars)
GATE_API_KEY = os.getenv("GATE_API_KEY", "")
GATE_API_SECRET = os.getenv("GATE_API_SECRET", "")
BITHUMB_API_KEY = os.getenv("BITHUMB_API_KEY", "")
BITHUMB_API_SECRET = os.getenv("BITHUMB_API_SECRET", "")
