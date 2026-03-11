import argparse
import json
import sys
import urllib.request
from pathlib import Path
from typing import Any, Dict, Iterable, List

# Gate.io endpoint for currency-level availability
GATEIO_URL = "https://api.gateio.ws/api/v4/spot/currencies"
USER_AGENT = "Mozilla/5.0 (Codex Helper)"
GATEIO_FILE = Path("gateio-status.json")


def fetch_gateio_info(url: str = GATEIO_URL) -> List[Dict[str, Any]]:
    """Fetch Gate.io currency-level deposit/withdraw info."""
    req = urllib.request.Request(
        url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        payload = json.load(resp)
    if not isinstance(payload, list):
        raise RuntimeError(f"Unexpected Gate.io response: {payload!r}")
    return payload


def save_json(data: Any, file_path: Path = GATEIO_FILE) -> None:
    """Persist data to disk."""
    with file_path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def print_human(entries: Iterable[Dict[str, Any]]) -> None:
    """Pretty-print Gate.io currency availability."""
    for coin in entries:
        symbol = coin.get("currency", "")
        name = coin.get("name", "")
        deposit = "OFF" if coin.get("deposit_disabled") else "ON"
        withdraw = "OFF" if coin.get("withdraw_disabled") else "ON"
        chain = coin.get("chain") or "multi"
        print(f"{symbol} ({name}) [{chain}]: deposit={deposit}, withdraw={withdraw}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Fetch Gate.io deposit/withdraw availability."
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print raw JSON instead of a human-readable summary.",
    )
    args = parser.parse_args()

    try:
        gateio_data = fetch_gateio_info()
    except Exception as exc:
        print(f"Failed to fetch data: {exc}", file=sys.stderr)
        sys.exit(1)

    save_json(gateio_data)

    if args.json:
        json.dump(gateio_data, sys.stdout, ensure_ascii=False, indent=2)
        print()
    else:
        print_human(gateio_data)


if __name__ == "__main__":
    main()
