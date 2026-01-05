import type { Exchange } from "ccxt";

export async function gateioSpotBalance(spot: Exchange, coin: string): Promise<number> {
  try {
    const bal: any = await spot.fetchBalance();
    const entry: any = bal?.[coin.toUpperCase()] ?? {};
    const free = Number(entry?.free ?? 0);
    const total = Number(entry?.total ?? 0);
    return total > 0 ? total : free;
  } catch {
    return 0.0;
  }
}

export async function bithumbSpotBalance(bithumb: Exchange, coin: string): Promise<number> {
  try {
    const bal: any = await bithumb.fetchBalance();
    const entry: any = bal?.[coin.toUpperCase()] ?? {};
    const free = Number(entry?.free ?? 0);
    const total = Number(entry?.total ?? 0);
    return total > 0 ? total : free;
  } catch {
    return 0.0;
  }
}
