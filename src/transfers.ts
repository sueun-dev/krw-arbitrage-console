import type { Exchange } from "ccxt";
import { fetchJson } from "./http";
import { ChainInfo, TransferStatus } from "./models";
import { normalizeChainName } from "./chains";

function coerceInt(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

type BithumbInoutPayload = {
  data?: Array<{
    coinSymbol?: string;
    networkInfoList?: Array<{
      networkName?: string;
      networkKey?: string;
      isDepositAvailable?: boolean;
      isWithdrawAvailable?: boolean;
      depositConfirmCount?: unknown;
      withdrawFeeQuantity?: unknown;
      withdrawMinimumQuantity?: unknown;
    }>;
  }>;
};

export async function bithumbInoutStatuses(coins: Iterable<string>): Promise<Record<string, TransferStatus>> {
  const coinSet = new Set(Array.from(coins, (c) => (c || "").toUpperCase()).filter(Boolean));
  const out: Record<string, TransferStatus> = {};
  for (const c of coinSet) {
    out[c] = { exchange: "bithumb", coin: c, depositOk: null, withdrawOk: null, chains: [], chainInfo: [] };
  }
  if (coinSet.size === 0) return out;

  try {
    const payload = await fetchJson<BithumbInoutPayload>("https://gw.bithumb.com/exchange/v1/coin-inout/info", {
      timeoutMs: 5000,
    });
    const coinList = payload?.data ?? [];
    const rowMap = new Map<string, any>();
    for (const row of coinList) {
      const sym = (row?.coinSymbol ?? "").toUpperCase();
      if (sym) rowMap.set(sym, row);
    }

    for (const coin of coinSet) {
      const target = rowMap.get(coin);
      if (!target) continue;

      const networks: any[] = target?.networkInfoList ?? [];
      const depositOk = networks.length ? networks.some((n) => n?.isDepositAvailable) : null;
      const withdrawOk = networks.length ? networks.some((n) => n?.isWithdrawAvailable) : null;

      const chains: string[] = [];
      const chainInfo: ChainInfo[] = [];
      for (const net of networks) {
        const name = String(net?.networkName ?? net?.networkKey ?? "NETWORK");
        const depOk = typeof net?.isDepositAvailable === "boolean" ? net.isDepositAvailable : null;
        const wdOk = typeof net?.isWithdrawAvailable === "boolean" ? net.isWithdrawAvailable : null;
        const confirmations = coerceInt(net?.depositConfirmCount);
        const withdrawFee = net?.withdrawFeeQuantity != null ? Number(net.withdrawFeeQuantity) : null;
        const withdrawMin = net?.withdrawMinimumQuantity != null ? Number(net.withdrawMinimumQuantity) : null;
        chainInfo.push({
          name,
          depositOk: depOk,
          withdrawOk: wdOk,
          confirmations,
          withdrawFee: Number.isFinite(withdrawFee) ? withdrawFee : null,
          withdrawMin: Number.isFinite(withdrawMin) ? withdrawMin : null,
        });
        if (depOk === true && wdOk === true) chains.push(name);
      }

      out[coin] = { exchange: "bithumb", coin, depositOk, withdrawOk, chains, chainInfo };
    }
  } catch {
    return out;
  }

  return out;
}

export async function gateioCurrencyStatuses(
  spot: Exchange,
  coins: Iterable<string>,
): Promise<Record<string, TransferStatus>> {
  const coinSet = new Set(Array.from(coins, (c) => (c || "").toUpperCase()).filter(Boolean));
  const out: Record<string, TransferStatus> = {};
  for (const c of coinSet) {
    out[c] = { exchange: "gateio", coin: c, depositOk: null, withdrawOk: null, chains: [], chainInfo: [] };
  }
  if (coinSet.size === 0) return out;

  let currencies: any;
  try {
    currencies = await spot.fetchCurrencies();
  } catch {
    return out;
  }

  let withdrawFees: any = null;
  try {
    if (typeof (spot as any).fetchDepositWithdrawFees === "function") {
      withdrawFees = await (spot as any).fetchDepositWithdrawFees(Array.from(coinSet));
    }
  } catch {
    withdrawFees = null;
  }

  for (const coin of coinSet) {
    const info: any = currencies?.[coin] ?? {};
    const deposit = info?.deposit;
    const withdraw = info?.withdraw;
    const depositOk = typeof deposit === "boolean" ? deposit : deposit != null ? Boolean(deposit) : null;
    const withdrawOk = typeof withdraw === "boolean" ? withdraw : withdraw != null ? Boolean(withdraw) : null;

    const chains: string[] = [];
    const chainInfo: ChainInfo[] = [];
    const networks = info?.networks;
    if (networks && typeof networks === "object") {
      for (const [netCode, netInfo] of Object.entries<any>(networks)) {
        const depOk = typeof netInfo?.deposit === "boolean" ? netInfo.deposit : netInfo?.deposit != null ? Boolean(netInfo.deposit) : null;
        const wdOk = typeof netInfo?.withdraw === "boolean" ? netInfo.withdraw : netInfo?.withdraw != null ? Boolean(netInfo.withdraw) : null;
        let withdrawFee: number | null = null;
        const feeRow = withdrawFees?.[coin];
        const feeNetworks: any = feeRow?.networks;
        if (feeNetworks && typeof feeNetworks === "object") {
          const direct = feeNetworks[String(netCode)]?.withdraw?.fee;
          if (direct != null && Number.isFinite(Number(direct))) withdrawFee = Number(direct);
          if (withdrawFee == null) {
            const wanted = normalizeChainName(String(netCode));
            for (const [feeNetCode, feeNet] of Object.entries<any>(feeNetworks)) {
              if (normalizeChainName(String(feeNetCode)) !== wanted) continue;
              const candidate = feeNet?.withdraw?.fee;
              if (candidate != null && Number.isFinite(Number(candidate))) withdrawFee = Number(candidate);
              break;
            }
          }
        } else if (feeRow?.withdraw?.fee != null && Number.isFinite(Number(feeRow.withdraw.fee))) {
          withdrawFee = Number(feeRow.withdraw.fee);
        }

        chainInfo.push({
          name: String(netCode),
          depositOk: depOk,
          withdrawOk: wdOk,
          confirmations: null,
          withdrawFee,
        });
        if (depOk === true && wdOk === true) chains.push(String(netCode));
      }
    }

    out[coin] = { exchange: "gateio", coin, depositOk, withdrawOk, chains, chainInfo };
  }

  return out;
}
