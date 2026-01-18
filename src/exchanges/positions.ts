/**
 * @fileoverview Exchange position fetching utilities for perpetual markets.
 */

import type { Exchange } from "ccxt";

/**
 * Position information for a perpetual market.
 */
export interface PerpPosition {
  /** Trading symbol (e.g., "BTC/USDT:USDT") */
  readonly symbol: string;
  /** Position side ("long" or "short") */
  readonly side: "long" | "short";
  /** Position size in base currency */
  readonly size: number;
  /** Number of contracts */
  readonly contracts: number;
  /** Contract size multiplier */
  readonly contractSize: number;
  /** Entry price */
  readonly entryPrice: number;
  /** Mark price */
  readonly markPrice: number;
  /** Unrealized PnL */
  readonly unrealizedPnl: number;
  /** Liquidation price */
  readonly liquidationPrice: number | null;
  /** Leverage used */
  readonly leverage: number;
}

/**
 * Fetches the short position quantity for a coin on GateIO perpetual.
 *
 * @param perp - GateIO perpetual exchange instance
 * @param coin - Coin symbol (e.g., "BTC", "ETH")
 * @returns Short position quantity in base currency, or 0 if no position
 */
export async function gateioPerpShortQty(
  perp: Exchange,
  coin: string
): Promise<number> {
  const coinUpper = coin.toUpperCase();
  let positions: unknown[] = [];

  try {
    const fetchPositions = (perp as { fetchPositions?: () => Promise<unknown[]> }).fetchPositions;
    if (fetchPositions) {
      positions = (await fetchPositions.call(perp)) ?? [];
    }
  } catch (error) {
    console.warn(`[gateio-perp] Failed to fetch positions for ${coin}:`, error);
    return 0.0;
  }

  for (const pos of positions) {
    if (typeof pos !== "object" || pos === null) continue;

    const position = pos as {
      symbol?: string;
      contracts?: number;
      size?: number;
      contractSize?: number;
      side?: string;
    };

    const symbol = String(position.symbol ?? "").toUpperCase();
    if (!symbol.includes(coinUpper)) continue;

    const contracts = position.contracts;
    const size = position.size;
    const contractSize = Number(position.contractSize ?? 1.0);
    const side = String(position.side ?? "").toLowerCase();

    let qty = 0.0;
    if (contracts !== null && contracts !== undefined && contracts !== 0) {
      qty = Math.abs(Number(contracts) * contractSize);
    } else if (size !== null && size !== undefined && size !== 0) {
      qty = Math.abs(Number(size));
    } else {
      continue;
    }

    // Only return short positions
    if (side && side !== "short") continue;
    return qty;
  }

  return 0.0;
}

/**
 * Fetches all perpetual positions for an exchange.
 *
 * @param perp - Perpetual exchange instance
 * @returns Array of position information
 */
export async function getAllPositions(perp: Exchange): Promise<PerpPosition[]> {
  const result: PerpPosition[] = [];

  try {
    const fetchPositions = (perp as { fetchPositions?: () => Promise<unknown[]> }).fetchPositions;
    if (!fetchPositions) {
      return result;
    }

    const positions = await fetchPositions.call(perp);
    if (!Array.isArray(positions)) {
      return result;
    }

    for (const pos of positions) {
      if (typeof pos !== "object" || pos === null) continue;

      const position = pos as {
        symbol?: string;
        contracts?: number;
        size?: number;
        contractSize?: number;
        side?: string;
        entryPrice?: number;
        markPrice?: number;
        unrealizedPnl?: number;
        liquidationPrice?: number;
        leverage?: number;
      };

      const contracts = Number(position.contracts ?? 0);
      const size = Number(position.size ?? 0);
      const contractSize = Number(position.contractSize ?? 1);

      // Skip empty positions
      if (contracts === 0 && size === 0) continue;

      const sideStr = String(position.side ?? "").toLowerCase();
      const side: "long" | "short" = sideStr === "short" ? "short" : "long";

      result.push({
        symbol: String(position.symbol ?? ""),
        side,
        size: Math.abs(size || contracts * contractSize),
        contracts: Math.abs(contracts),
        contractSize,
        entryPrice: Number(position.entryPrice ?? 0),
        markPrice: Number(position.markPrice ?? 0),
        unrealizedPnl: Number(position.unrealizedPnl ?? 0),
        liquidationPrice: position.liquidationPrice ? Number(position.liquidationPrice) : null,
        leverage: Number(position.leverage ?? 1),
      });
    }
  } catch (error) {
    console.warn("Failed to fetch positions:", error);
  }

  return result;
}

/**
 * Gets the position for a specific symbol.
 *
 * @param perp - Perpetual exchange instance
 * @param symbol - Trading symbol to find
 * @returns Position info or null if not found
 */
export async function getPositionBySymbol(
  perp: Exchange,
  symbol: string
): Promise<PerpPosition | null> {
  const positions = await getAllPositions(perp);
  const symbolUpper = symbol.toUpperCase();

  for (const pos of positions) {
    if (pos.symbol.toUpperCase().includes(symbolUpper)) {
      return pos;
    }
  }

  return null;
}
