import argparse
import json
import sys
import urllib.request
from pathlib import Path
from typing import Any, Dict, Iterable, List

# Public Bithumb endpoint that exposes deposit/withdraw availability and fees
BITHUMB_URL = "https://gw.bithumb.com/exchange/v1/coin-inout/info?_=1763224764210&retry=0"
USER_AGENT = "Mozilla/5.0 (Codex Helper)"
BITHUMB_FILE = Path("bithumb-status.json")


def fetch_bithumb_info(url: str = BITHUMB_URL) -> List[Dict[str, Any]]:
    """Fetch full coin in/out info payload."""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=15) as resp:
        payload = json.load(resp)
    if payload.get("code") != "common.success.00001":
        raise RuntimeError(f"Bithumb API returned error: {payload}")
    return payload.get("data", [])


def save_json(data: Any, file_path: Path) -> None:
    """Persist data to disk."""
    with file_path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def print_human(entries: Iterable[Dict[str, Any]]) -> None:
    """Pretty-print key details per coin/network."""
    for coin in entries:
        print(f"{coin['coinSymbol']} ({coin['coinNameEn']})")
        for net in coin.get("networkInfoList", []):
            deposit = "ON" if net.get("isDepositAvailable") else "OFF"
            withdraw = "ON" if net.get("isWithdrawAvailable") else "OFF"
            fee = net.get("smallDepositFeeQuantity", "0")
            base = net.get("smallDepositBaseQuantity", "0")
            w_fee = net.get("withdrawFeeQuantity", "0")
            w_min = net.get("withdrawMinimumQuantity", "0")
            print(
                f"  - {net.get('networkName')}: "
                f"deposit={deposit}, withdraw={withdraw}, "
                f"small_deposit_fee={fee} (base {base}), "
                f"withdraw_fee={w_fee}, withdraw_min={w_min}"
            )
        print()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Fetch Bithumb deposit/withdraw availability and fees."
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print raw JSON instead of a human-readable summary.",
    )
    args = parser.parse_args()

    try:
        bithumb_data = fetch_bithumb_info()
    except Exception as exc:
        print(f"Failed to fetch data: {exc}", file=sys.stderr)
        sys.exit(1)

    save_json(bithumb_data, BITHUMB_FILE)

    if args.json:
        json.dump(bithumb_data, sys.stdout, ensure_ascii=False, indent=2)
        print()
    else:
        print_human(bithumb_data)


if __name__ == "__main__":
    main()
