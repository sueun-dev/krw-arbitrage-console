/**
 * @fileoverview Exchange balance fetching utilities.
 */

import type { Exchange } from "ccxt";

/**
 * Balance information for a coin.
 */
export interface CoinBalance {
  /** Available balance for trading */
  readonly free: number;
  /** Total balance including locked */
  readonly total: number;
  /** Locked/reserved balance */
  readonly locked: number;
}

/**
 * Fetches the spot balance for a coin on GateIO.
 *
 * @param spot - GateIO spot exchange instance
 * @param coin - Coin symbol (e.g., "BTC", "ETH")
 * @returns Balance amount (total if available, otherwise free)
 * @throws {ExchangeApiError} When balance fetch fails (only if throwOnError is true)
 */
export async function gateioSpotBalance(
  spot: Exchange,
  coin: string
): Promise<number> {
  try {
    const bal = await spot.fetchBalance();
    const entry = bal?.[coin.toUpperCase()] as { free?: number; total?: number } | undefined;
    const free = Number(entry?.free ?? 0);
    const total = Number(entry?.total ?? 0);
    return total > 0 ? total : free;
  } catch (error) {
    // Return 0 for graceful degradation in monitoring mode
    console.warn(`[gateio] Failed to fetch balance for ${coin}:`, error);
    return 0.0;
  }
}

/**
 * Fetches the spot balance for a coin on Bithumb.
 *
 * @param bithumb - Bithumb exchange instance
 * @param coin - Coin symbol (e.g., "BTC", "ETH")
 * @returns Balance amount (total if available, otherwise free)
 */
export async function bithumbSpotBalance(
  bithumb: Exchange,
  coin: string
): Promise<number> {
  try {
    const bal = await bithumb.fetchBalance();
    const entry = bal?.[coin.toUpperCase()] as { free?: number; total?: number } | undefined;
    const free = Number(entry?.free ?? 0);
    const total = Number(entry?.total ?? 0);
    return total > 0 ? total : free;
  } catch (error) {
    console.warn(`[bithumb] Failed to fetch balance for ${coin}:`, error);
    return 0.0;
  }
}

/**
 * Fetches the spot balance for a coin on Upbit.
 *
 * @param upbit - Upbit exchange instance
 * @param coin - Coin symbol (e.g., "BTC", "ETH")
 * @returns Balance amount (total if available, otherwise free)
 */
export async function upbitSpotBalance(
  upbit: Exchange,
  coin: string
): Promise<number> {
  try {
    const bal = await upbit.fetchBalance();
    const entry = bal?.[coin.toUpperCase()] as { free?: number; total?: number } | undefined;
    const free = Number(entry?.free ?? 0);
    const total = Number(entry?.total ?? 0);
    return total > 0 ? total : free;
  } catch (error) {
    console.warn(`[upbit] Failed to fetch balance for ${coin}:`, error);
    return 0.0;
  }
}

/**
 * Fetches the detailed balance info for a coin.
 *
 * @param exchange - Exchange instance
 * @param coin - Coin symbol
 * @returns Detailed balance information
 */
export async function getDetailedBalance(
  exchange: Exchange,
  coin: string
): Promise<CoinBalance> {
  try {
    const bal = await exchange.fetchBalance();
    const entry = bal?.[coin.toUpperCase()] as { free?: number; total?: number; used?: number } | undefined;
    const free = Number(entry?.free ?? 0);
    const total = Number(entry?.total ?? 0);
    const locked = Number(entry?.used ?? 0);
    return { free, total, locked };
  } catch {
    return { free: 0, total: 0, locked: 0 };
  }
}

/**
 * Fetches all balances for an exchange.
 *
 * @param exchange - Exchange instance
 * @returns Map of coin symbols to balance amounts
 */
export async function getAllBalances(
  exchange: Exchange
): Promise<Map<string, CoinBalance>> {
  const result = new Map<string, CoinBalance>();

  try {
    const bal = await exchange.fetchBalance();

    for (const [coin, entry] of Object.entries(bal)) {
      // Skip special keys
      if (coin === "info" || coin === "timestamp" || coin === "datetime" ||
          coin === "free" || coin === "used" || coin === "total") {
        continue;
      }

      const coinEntry = entry as { free?: number; total?: number; used?: number } | undefined;
      if (!coinEntry) continue;

      const free = Number(coinEntry.free ?? 0);
      const total = Number(coinEntry.total ?? 0);
      const locked = Number(coinEntry.used ?? 0);

      if (free > 0 || total > 0) {
        result.set(coin, { free, total, locked });
      }
    }
  } catch (error) {
    console.warn("Failed to fetch all balances:", error);
  }

  return result;
}
