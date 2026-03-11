import json
import sys
import urllib.request
from decimal import Decimal, InvalidOperation
from pathlib import Path
import re
from typing import Any, Dict, Iterable, List, Optional, Tuple

# Endpoints
BITHUMB_URL = "https://gw.bithumb.com/exchange/v1/coin-inout/info?_=1763224764210&retry=0"
GATEIO_URL = "https://api.gateio.ws/api/v4/spot/currencies"
USER_AGENT = "Mozilla/5.0 (Codex Helper)"

# Output files
BITHUMB_FILE = Path("bithumb-status.json")
GATEIO_FILE = Path("gateio-status.json")
COMMON_FILE = Path("bithumb-gateio-common.json")
TRANSFER_FILE = Path("bithumb-to-gateio-available.json")


def normalize_chain(name: Optional[str]) -> str:
    """
    Normalize chain/network name for loose matching between Bithumb and Gate.io.
    - Lowercase
    - Remove spaces, hyphen, underscore
    - Apply simple aliases (eth/ethereum -> erc20, trx/tron -> trc20, bep20 -> bsc, arbevm -> arbitrumone)
    """
    if not name:
        return ""
    key = re.sub(r"[\s\-_]", "", str(name)).lower()
    aliases = {
        "eth": "erc20",
        "ethereum": "erc20",
        "erc": "erc20",
        "trx": "trc20",
        "tron": "trc20",
        "bep20": "bsc",
        "arb": "arbitrumone",
        "arbitrum": "arbitrumone",
        "arbevm": "arbitrumone",
    }
    return aliases.get(key, key)


def fetch_json(url: str) -> Any:
    req = urllib.request.Request(
        url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.load(resp)


def load_bithumb() -> List[Dict[str, Any]]:
    payload = fetch_json(BITHUMB_URL)
    if payload.get("code") != "common.success.00001":
        raise RuntimeError(f"Bithumb API returned error: {payload}")
    return payload.get("data", [])


def load_gateio() -> List[Dict[str, Any]]:
    payload = fetch_json(GATEIO_URL)
    if not isinstance(payload, list):
        raise RuntimeError(f"Unexpected Gate.io response: {payload!r}")
    return payload


def pick_bithumb_main_network(networks: Iterable[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    nets = list(networks)
    for net in nets:
        if net.get("isMainNetwork"):
            return net
    return nets[0] if nets else None


def to_decimal(value: Any) -> Optional[Decimal]:
    if value in (None, "", "0", "0.0", "0.00"):
        try:
            return Decimal(str(value))
        except Exception:
            return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return None


def summarize_bithumb(coin: Dict[str, Any]) -> Dict[str, Any]:
    networks = coin.get("networkInfoList", [])
    main = pick_bithumb_main_network(networks)
    deposit_any = any(n.get("isDepositAvailable") for n in networks)
    withdraw_any = any(n.get("isWithdrawAvailable") for n in networks)
    fee_dec = to_decimal(main.get("withdrawFeeQuantity")) if main else None
    price_dec = to_decimal(coin.get("coinKrwSise"))
    fee_krw = fee_dec * price_dec if (fee_dec is not None and price_dec is not None) else None
    nets = []
    for n in networks:
        nets.append(
            {
                "name": n.get("networkName"),
                "normalized": normalize_chain(n.get("networkName")),
                "is_main": n.get("isMainNetwork", False),
                "deposit": n.get("isDepositAvailable", False),
                "withdraw": n.get("isWithdrawAvailable", False),
                "withdraw_fee": n.get("withdrawFeeQuantity"),
                "withdraw_min": n.get("withdrawMinimumQuantity"),
            }
        )
    return {
        "name": coin.get("coinNameEn") or coin.get("coinName"),
        "deposit": deposit_any,
        "withdraw": withdraw_any,
        "withdraw_fee": main.get("withdrawFeeQuantity") if main else None,
        "withdraw_fee_krw": float(fee_krw) if fee_krw is not None else None,
        "withdraw_min": main.get("withdrawMinimumQuantity") if main else None,
        "networks": nets,
    }


def summarize_gateio(coin: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "name": coin.get("name"),
        "deposit": not coin.get("deposit_disabled", False),
        "withdraw": not coin.get("withdraw_disabled", False),
        "chain": coin.get("chain"),
        "normalized_chain": normalize_chain(coin.get("chain")),
    }


def merge_common(
    bithumb: List[Dict[str, Any]], gateio: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    b_map: Dict[str, Dict[str, Any]] = {}
    for c in bithumb:
        sym = (c.get("coinSymbol") or "").upper()
        if not sym:
            continue
        b_map[sym] = c

    # Gate는 체인별로 여러 row가 있을 수 있어 심볼 기준으로 group
    g_map: Dict[str, List[Dict[str, Any]]] = {}
    for c in gateio:
        sym = (c.get("currency") or "").upper()
        if not sym:
            continue
        g_map.setdefault(sym, []).append(c)

    common = sorted(set(b_map.keys()) & set(g_map.keys()))
    merged: List[Dict[str, Any]] = []
    for sym in common:
        b_summary = summarize_bithumb(b_map[sym])
        g_summaries = [summarize_gateio(row) for row in g_map[sym]]
        gate_deposit_any = any(s["deposit"] for s in g_summaries)
        gate_withdraw_any = any(s["withdraw"] for s in g_summaries)
        gate_networks = [
            {
                "chain": s["chain"],
                "normalized": s["normalized_chain"],
                "deposit": s["deposit"],
                "withdraw": s["withdraw"],
            }
            for s in g_summaries
        ]

        # 체인 매칭: 빗썸 withdraw 가능 + Gate deposit 가능 + normalized chain 동일
        matched_networks: List[Dict[str, Any]] = []
        for bn in b_summary["networks"]:
            if not bn["withdraw"]:
                continue
            for gn in gate_networks:
                if not gn["deposit"]:
                    continue
                if bn["normalized"] and bn["normalized"] == gn["normalized"]:
                    matched_networks.append(
                        {
                            "bithumb_network": bn["name"],
                            "gate_chain": gn["chain"],
                            "normalized": bn["normalized"],
                            "bithumb_withdraw_fee": bn["withdraw_fee"],
                            "bithumb_withdraw_min": bn["withdraw_min"],
                        }
                    )

        merged.append(
            {
                "symbol": sym,
                "bithumb_name": b_summary["name"],
                "gateio_name": g_summaries[0]["name"] if g_summaries else "",
                "bithumb": {
                    "deposit": b_summary["deposit"],
                    "withdraw": b_summary["withdraw"],
                    "withdraw_fee": b_summary["withdraw_fee"],
                    "withdraw_fee_krw": b_summary["withdraw_fee_krw"],
                    "withdraw_min": b_summary["withdraw_min"],
                    "networks": b_summary["networks"],
                },
                "gateio": {
                    "deposit": gate_deposit_any,
                    "withdraw": gate_withdraw_any,
                    "networks": gate_networks,
                },
                "matched_networks": matched_networks,
            }
        )
    return merged


def save_json(data: Any, file_path: Path) -> None:
    with file_path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def filter_transferable(merged: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Items where Bithumb can withdraw and Gate.io can deposit on the SAME chain."""
    result: List[Dict[str, Any]] = []
    for item in merged:
        if item["matched_networks"]:
            result.append(item)
    return result


def main() -> None:
    try:
        bithumb_data = load_bithumb()
        gateio_data = load_gateio()
    except Exception as exc:
        print(f"Failed to fetch data: {exc}", file=sys.stderr)
        sys.exit(1)

    save_json(bithumb_data, BITHUMB_FILE)
    save_json(gateio_data, GATEIO_FILE)

    merged = merge_common(bithumb_data, gateio_data)
    save_json(merged, COMMON_FILE)

    transferable = filter_transferable(merged)
    save_json(transferable, TRANSFER_FILE)

    print(f"Common symbols: {len(merged)}")
    print(f"Transferable (Bithumb withdraw AND Gate.io deposit): {len(transferable)}")
    for item in transferable[:10]:
        print(
            f"{item['symbol']}: "
            f"Bithumb withdraw fee={item['bithumb']['withdraw_fee']}, "
            f"Bithumb withdraw_fee_krw={item['bithumb']['withdraw_fee_krw']}, "
            f"Bithumb withdraw_min={item['bithumb']['withdraw_min']}, "
            f"Gate.io deposit={item['gateio']['deposit']}"
        )


if __name__ == "__main__":
    main()
