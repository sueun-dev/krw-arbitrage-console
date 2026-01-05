"""Chain normalization helpers."""

from __future__ import annotations

import re
from typing import Dict, Iterable, Tuple

_CHAIN_TOKEN_RE = re.compile(r"[^A-Z0-9]")
_CHAIN_ALIASES: Dict[str, str] = {
    "APTOS": "APT",
    "APT": "APT",
    "ASTAR": "ASTR",
    "ALGORAND": "ALGO",
    "ALLORA": "ALLO",
    "AELF": "ELF",
    "AVAILDA": "AVAIL",
    "ARBITRUMONE": "ARBONE",
    "ARBONE": "ARBONE",
    "ARBITRUMNOVA": "ARBNOVA",
    "ARBNOVA": "ARBNOVA",
    "ARWEAVE": "AR",
    "AVALANCHECCHAIN": "AVAXC",
    "AVALANCHEC": "AVAXC",
    "AVAXC": "AVAXC",
    "BABYLON": "BABY",
    "CELESTIA": "TIA",
    "BASE": "BASE",
    "BERACHAIN": "BERA",
    "BINANCESMARTCHAIN": "BEP20",
    "BNBSMARTCHAIN": "BEP20",
    "BOUNCEBIT": "BB",
    "BSC": "BEP20",
    "BEP20": "BEP20",
    "BITCOIN": "BTC",
    "BITCOINCASH": "BCH",
    "BITCOINSV": "BSV",
    "BITTENSOR": "TAO",
    "BTC": "BTC",
    "CSPR": "CSPR",
    "CASPER": "CSPR",
    "CARDANO": "ADA",
    "CELOL2": "CELO",
    "CFXESPACE": "CFXEVM",
    "CHILIZCHAIN": "CHZ2",
    "COREDAO": "CORE",
    "COSMOS": "ATOM",
    "CRONOS": "CRO",
    "DOGECOIN": "DOGE",
    "DYDXCHAIN": "DYDX",
    "ECASH": "XEC",
    "ECLIPSE": "ES",
    "ENJIN": "ENJ",
    "ERC20": "ERC20",
    "ETH": "ERC20",
    "ETHEREUM": "ERC20",
    "ETHEREUMCLASSIC": "ETC",
    "ETHEREUMPOW": "ETHW",
    "FILECOIN": "FIL",
    "FLARE": "FLR",
    "G": "G",
    "GRAVITY": "G",
    "HIPPOPROTOCOL": "HP",
    "ICON": "ICX",
    "INTERNETCOMPUTER": "ICP",
    "INJECTIVE": "INJ",
    "INITIA": "INIT",
    "IOTEX": "IOTX",
    "KAIA": "KAIA",
    "KLAYTN": "KAIA",
    "MANTRA": "OM",
    "LUNA": "LUNA",
    "TERRA": "LUNA",
    "MATIC": "MATIC",
    "MEDIBLOC": "MED",
    "METALL2": "MTLETH",
    "MONAD": "MON",
    "MERLINCHAIN": "MERLBTC",
    "MULTIVERSEX": "EGLD",
    "NEARPROTOCOL": "NEAR",
    "NEON3": "GAS",
    "NERVOSNETWORK": "CKB",
    "NILLION": "NIL",
    "OASYS": "OAS",
    "OPTIMISM": "OP",
    "OP": "OP",
    "ONTOLOGY": "ONG",
    "OSMOSIS": "OSMO",
    "PLASMA": "XPL",
    "POCKETNETWORK": "POKT",
    "POLYGON": "MATIC",
    "POLYMESH": "POLYX",
    "PROTON": "XPR",
    "QUARKCHAIN": "QKC",
    "RAVEN": "RVN",
    "REINETWORK": "REI",
    "RON": "RON",
    "RONIN": "RON",
    "SIACOIN": "SC",
    "SEINETWORK": "SEI",
    "SHENTU": "CTK",
    "S": "S",
    "SONIC": "S",
    "SONGBIRD": "SGB",
    "SOLAR": "SXP",
    "SOL": "SOL",
    "SOLANA": "SOL",
    "SOMNIA": "SOMI",
    "SOPHON": "SOPH",
    "STELLAR": "XLM",
    "STORY": "IP",
    "STRATIS": "STRAX",
    "STRKETH": "STRKETH",
    "STARKNET": "STRKETH",
    "STACKS": "STX",
    "SWELLCHAIN": "SWELL",
    "TRC20": "TRC20",
    "TRON": "TRC20",
    "TRX": "TRC20",
    "TEZOS": "XTZ",
    "THUNDERCORE": "TT",
    "THETA": "THETA",
    "THETANETWORK": "THETA",
    "VAULTA": "A",
    "VECHAIN": "VET",
    "WAX": "WAXP",
    "WORLDCHAIN": "WLD",
    "ZETA": "ZETA",
    "ZETACHAIN": "ZETA",
    "ZKSERA": "ZKSERA",
    "ZKSYNCERA": "ZKSERA",
    "ZILLIQA": "ZIL",
    "ZIRCUIT": "ZRC",
}


def normalize_chain_name(name: str) -> str:
    token = _CHAIN_TOKEN_RE.sub("", (name or "").upper())
    return _CHAIN_ALIASES.get(token, token)


def common_chains(a: Iterable[str], b: Iterable[str]) -> Tuple[str, ...]:
    """Best-effort intersection of chain names."""
    a_map = _canonical_chain_map(a)
    b_map = _canonical_chain_map(b)
    keys = sorted(set(a_map) & set(b_map))
    return tuple(a_map[k] for k in keys)


def common_chain_pairs(a: Iterable[str], b: Iterable[str]) -> Tuple[Tuple[str, str], ...]:
    """Best-effort intersection returning `(a_name, b_name)` pairs."""
    a_map = _canonical_chain_map(a)
    b_map = _canonical_chain_map(b)
    keys = sorted(set(a_map) & set(b_map))
    return tuple((a_map[k], b_map[k]) for k in keys)


def _canonical_chain_map(names: Iterable[str]) -> Dict[str, str]:
    out: Dict[str, str] = {}
    for name in names:
        if not name:
            continue
        key = normalize_chain_name(name)
        if key and key not in out:
            out[key] = name
    return out
