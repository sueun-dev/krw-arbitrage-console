import type { Exchange } from "ccxt";

export async function gateioPerpShortQty(perp: Exchange, coin: string): Promise<number> {
  const coinUpper = coin.toUpperCase();
  let positions: any[] = [];
  try {
    positions = (await (perp as any).fetchPositions?.()) ?? [];
  } catch {
    return 0.0;
  }

  for (const pos of positions) {
    const symbol = String(pos?.symbol ?? "").toUpperCase();
    if (!symbol.includes(coinUpper)) continue;
    const contracts = pos?.contracts;
    const size = pos?.size;
    const contractSize = Number(pos?.contractSize ?? 1.0);
    const side = String(pos?.side ?? "").toLowerCase();

    let qty = 0.0;
    if (contracts !== null && contracts !== undefined && contracts !== 0) qty = Math.abs(Number(contracts) * contractSize);
    else if (size !== null && size !== undefined && size !== 0) qty = Math.abs(Number(size));
    else continue;

    if (side && side !== "short") continue;
    return qty;
  }

  return 0.0;
}
