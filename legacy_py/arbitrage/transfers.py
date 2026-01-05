"""Deposit/withdraw status helpers."""

from __future__ import annotations

from typing import Any, Dict, Iterable, Optional

import ccxt
import requests

from .models import ChainInfo, TransferStatus


def _coerce_int(value: Any) -> Optional[int]:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def bithumb_inout_status(coin: str) -> TransferStatus:
    """Fetches Bithumb deposit/withdraw status (public endpoint)."""
    url = "https://gw.bithumb.com/exchange/v1/coin-inout/info"
    try:
        resp = requests.get(url, timeout=5)
        resp.raise_for_status()
        payload = resp.json()
        coin_list = payload.get("data") or []
        target = next((c for c in coin_list if (c.get("coinSymbol") or "").upper() == coin.upper()), None)
        if not target:
            return TransferStatus(exchange="bithumb", coin=coin.upper(), deposit_ok=None, withdraw_ok=None, chains=())

        networks = target.get("networkInfoList") or []
        deposit_ok = any(net.get("isDepositAvailable") for net in networks) if networks else None
        withdraw_ok = any(net.get("isWithdrawAvailable") for net in networks) if networks else None

        chains = []
        chain_info = []
        for net in networks:
            name = str(net.get("networkName") or net.get("networkKey") or "NETWORK")
            dep_ok = net.get("isDepositAvailable")
            wd_ok = net.get("isWithdrawAvailable")
            confirmations = _coerce_int(net.get("depositConfirmCount"))
            chain_info.append(ChainInfo(name=name, deposit_ok=dep_ok, withdraw_ok=wd_ok, confirmations=confirmations))

            if dep_ok is True and wd_ok is True:
                chains.append(name)

        return TransferStatus(
            exchange="bithumb",
            coin=coin.upper(),
            deposit_ok=deposit_ok,
            withdraw_ok=withdraw_ok,
            chains=tuple(chains),
            chain_info=tuple(chain_info),
        )
    except Exception:
        return TransferStatus(exchange="bithumb", coin=coin.upper(), deposit_ok=None, withdraw_ok=None, chains=())


def bithumb_inout_statuses(coins: Iterable[str]) -> Dict[str, TransferStatus]:
    """Batch version of `bithumb_inout_status` (single HTTP request)."""
    coin_set = {c.upper() for c in coins if c}
    if not coin_set:
        return {}

    url = "https://gw.bithumb.com/exchange/v1/coin-inout/info"
    out: Dict[str, TransferStatus] = {
        c: TransferStatus(
            exchange="bithumb",
            coin=c,
            deposit_ok=None,
            withdraw_ok=None,
            chains=(),
            chain_info=(),
        )
        for c in coin_set
    }

    try:
        resp = requests.get(url, timeout=5)
        resp.raise_for_status()
        payload = resp.json()
        coin_list = payload.get("data") or []
        row_map: Dict[str, Any] = {}
        for row in coin_list:
            sym = (row.get("coinSymbol") or "").upper()
            if sym:
                row_map[sym] = row

        for coin in coin_set:
            target = row_map.get(coin)
            if not target:
                continue

            networks = target.get("networkInfoList") or []
            deposit_ok = any(net.get("isDepositAvailable") for net in networks) if networks else None
            withdraw_ok = any(net.get("isWithdrawAvailable") for net in networks) if networks else None

            chains: list[str] = []
            chain_info: list[ChainInfo] = []
            for net in networks:
                name = str(net.get("networkName") or net.get("networkKey") or "NETWORK")
                dep_ok = net.get("isDepositAvailable")
                wd_ok = net.get("isWithdrawAvailable")
                confirmations = _coerce_int(net.get("depositConfirmCount"))
                chain_info.append(ChainInfo(name=name, deposit_ok=dep_ok, withdraw_ok=wd_ok, confirmations=confirmations))

                if dep_ok is True and wd_ok is True:
                    chains.append(name)

            out[coin] = TransferStatus(
                exchange="bithumb",
                coin=coin,
                deposit_ok=deposit_ok,
                withdraw_ok=withdraw_ok,
                chains=tuple(chains),
                chain_info=tuple(chain_info),
            )

    except Exception:
        return out

    return out


def gateio_currency_status(spot: ccxt.Exchange, coin: str) -> TransferStatus:
    """Fetches GateIO deposit/withdraw status via ccxt currencies."""
    coin_upper = coin.upper()
    try:
        currencies = spot.fetch_currencies()
    except Exception:
        return TransferStatus(exchange="gateio", coin=coin_upper, deposit_ok=None, withdraw_ok=None, chains=())

    info = currencies.get(coin_upper) or currencies.get(coin_upper.upper()) or {}
    deposit_ok = info.get("deposit")
    withdraw_ok = info.get("withdraw")

    chains: list[str] = []
    networks = info.get("networks")
    if isinstance(networks, dict):
        for net_code, net_info in networks.items():
            if net_info.get("deposit") is True and net_info.get("withdraw") is True:
                chains.append(str(net_code))

    chain_info: list[ChainInfo] = []
    if isinstance(networks, dict):
        for net_code, net_info in networks.items():
            dep_ok = net_info.get("deposit")
            wd_ok = net_info.get("withdraw")
            chain_info.append(
                ChainInfo(name=str(net_code), deposit_ok=dep_ok, withdraw_ok=wd_ok, confirmations=None)
            )

    return TransferStatus(
        exchange="gateio",
        coin=coin_upper,
        deposit_ok=bool(deposit_ok) if deposit_ok is not None else None,
        withdraw_ok=bool(withdraw_ok) if withdraw_ok is not None else None,
        chains=tuple(chains),
        chain_info=tuple(chain_info),
    )


def gateio_currency_statuses(spot: ccxt.Exchange, coins: Iterable[str]) -> Dict[str, TransferStatus]:
    """Batch version of `gateio_currency_status` (single ccxt call)."""
    coin_set = {c.upper() for c in coins if c}
    if not coin_set:
        return {}

    out: Dict[str, TransferStatus] = {
        c: TransferStatus(
            exchange="gateio",
            coin=c,
            deposit_ok=None,
            withdraw_ok=None,
            chains=(),
            chain_info=(),
        )
        for c in coin_set
    }

    try:
        currencies = spot.fetch_currencies()
    except Exception:
        return out

    for coin in coin_set:
        info = currencies.get(coin) or currencies.get(coin.upper()) or {}
        deposit_ok = info.get("deposit")
        withdraw_ok = info.get("withdraw")

        chains: list[str] = []
        chain_info: list[ChainInfo] = []
        networks = info.get("networks")
        if isinstance(networks, dict):
            for net_code, net_info in networks.items():
                name = str(net_code)
                dep_ok = net_info.get("deposit")
                wd_ok = net_info.get("withdraw")
                chain_info.append(ChainInfo(name=name, deposit_ok=dep_ok, withdraw_ok=wd_ok, confirmations=None))
                if dep_ok is True and wd_ok is True:
                    chains.append(name)

        out[coin] = TransferStatus(
            exchange="gateio",
            coin=coin,
            deposit_ok=bool(deposit_ok) if deposit_ok is not None else None,
            withdraw_ok=bool(withdraw_ok) if withdraw_ok is not None else None,
            chains=tuple(chains),
            chain_info=tuple(chain_info),
        )

    return out
