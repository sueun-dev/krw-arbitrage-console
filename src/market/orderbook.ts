/**
 * @fileoverview Orderbook utilities for fill estimation and analysis.
 */

import type { MarketQuote } from "../core/types";

/** Orderbook level as [price, amount] tuple */
export type Level = [number, number];

/**
 * Result of orderbook fill analysis.
 */
export interface FillAnalysis {
  /** Total base quantity filled */
  readonly baseQty: number;
  /** Total quote quantity (cost or proceeds) */
  readonly quoteQty: number;
  /** Volume-weighted average price */
  readonly vwapPrice: number;
  /** Best price in the orderbook */
  readonly bestPrice: number;
  /** Worst price reached during fill */
  readonly worstPrice: number;
  /** Number of levels consumed */
  readonly levels: number;
  /** Price impact percentage from best to worst */
  readonly impactPct: number;
}

/**
 * Normalizes raw orderbook levels to valid Level tuples.
 * Filters out invalid entries (non-positive price or amount).
 *
 * @param levels - Raw levels from exchange API
 * @returns Array of valid Level tuples
 */
function normalizeLevels(levels: unknown): Level[] {
  if (!Array.isArray(levels)) {
    return [];
  }

  const result: Level[] = [];
  for (const row of levels) {
    if (!Array.isArray(row) || row.length < 2) {
      continue;
    }
    const price = Number(row[0]);
    const amount = Number(row[1]);
    if (Number.isFinite(price) && Number.isFinite(amount) && price > 0 && amount > 0) {
      result.push([price, amount]);
    }
  }
  return result;
}

/**
 * Normalizes and sorts ask levels (lowest first).
 *
 * @param asks - Raw ask levels
 * @returns Sorted array of valid Level tuples
 */
function normalizeAsks(asks: unknown): Level[] {
  return normalizeLevels(asks).sort((a, b) => a[0] - b[0]);
}

/**
 * Normalizes and sorts bid levels (highest first).
 *
 * @param bids - Raw bid levels
 * @returns Sorted array of valid Level tuples
 */
function normalizeBids(bids: unknown): Level[] {
  return normalizeLevels(bids).sort((a, b) => b[0] - a[0]);
}

/**
 * Estimates the average fill price for a given base quantity.
 *
 * @param levels - Orderbook levels (bids for sell, asks for buy)
 * @param baseQty - Quantity to fill in base currency
 * @returns Average fill price, or null if insufficient liquidity
 *
 * @example
 * ```typescript
 * const asks = [[100, 1], [101, 2], [102, 3]];
 * estimateFillFromBase(asks, 2); // Returns ~100.33 (average of 1@100, 1@101)
 * ```
 */
export function estimateFillFromBase(levels: unknown, baseQty: number): number | null {
  if (baseQty <= 0) {
    return null;
  }

  let remaining = baseQty;
  let cost = 0.0;

  for (const [price, amount] of normalizeLevels(levels)) {
    const take = Math.min(amount, remaining);
    cost += price * take;
    remaining -= take;
    if (remaining <= 1e-12) {
      break;
    }
  }

  if (remaining > 1e-12) {
    return null;
  }
  return cost / baseQty;
}

/**
 * Estimates the fill result for a given quote amount.
 *
 * @param levels - Orderbook levels
 * @param quoteAmount - Amount to spend in quote currency
 * @returns Fill result with base quantity and average price, or null if insufficient liquidity
 */
export function estimateFillFromQuote(
  levels: unknown,
  quoteAmount: number
): { baseQty: number; price: number } | null {
  if (quoteAmount <= 0) {
    return null;
  }

  let remaining = quoteAmount;
  let baseQty = 0.0;
  let cost = 0.0;

  for (const [price, amount] of normalizeLevels(levels)) {
    const levelCost = price * amount;
    if (levelCost <= remaining) {
      baseQty += amount;
      cost += levelCost;
      remaining -= levelCost;
    } else {
      const partial = remaining / price;
      baseQty += partial;
      cost += remaining;
      remaining = 0.0;
      break;
    }
  }

  if (remaining > 1e-12 || baseQty <= 0) {
    return null;
  }
  return { baseQty, price: cost / baseQty };
}

/**
 * Analyzes a buy order fill from asks given a quote amount.
 *
 * @param asks - Ask levels from orderbook
 * @param quoteAmount - Amount to spend in quote currency
 * @returns Detailed fill analysis, or null if insufficient liquidity
 */
export function analyzeBuyFillFromQuote(asks: unknown, quoteAmount: number): FillAnalysis | null {
  if (quoteAmount <= 0) {
    return null;
  }

  const levels = normalizeAsks(asks);
  const firstLevel = levels[0];
  if (!firstLevel) {
    return null;
  }

  const bestPrice = firstLevel[0];
  let remaining = quoteAmount;
  let baseQty = 0.0;
  let cost = 0.0;
  let worstPrice = bestPrice;
  let usedLevels = 0;

  for (const [price, amount] of levels) {
    if (remaining <= 1e-12) {
      break;
    }
    const levelCost = price * amount;
    usedLevels += 1;

    if (levelCost <= remaining) {
      baseQty += amount;
      cost += levelCost;
      remaining -= levelCost;
      worstPrice = price;
    } else {
      const partial = remaining / price;
      baseQty += partial;
      cost += remaining;
      remaining = 0.0;
      worstPrice = price;
      break;
    }
  }

  if (remaining > 1e-12 || baseQty <= 0) {
    return null;
  }

  const vwapPrice = cost / baseQty;
  const impactPct = ((worstPrice - bestPrice) / bestPrice) * 100.0;

  return {
    baseQty,
    quoteQty: quoteAmount,
    vwapPrice,
    bestPrice,
    worstPrice,
    levels: usedLevels,
    impactPct,
  };
}

/**
 * Analyzes a sell order fill from bids given a base quantity.
 *
 * @param bids - Bid levels from orderbook
 * @param baseQty - Quantity to sell in base currency
 * @returns Detailed fill analysis, or null if insufficient liquidity
 */
export function analyzeSellFillFromBase(bids: unknown, baseQty: number): FillAnalysis | null {
  if (baseQty <= 0) {
    return null;
  }

  const levels = normalizeBids(bids);
  const firstLevel = levels[0];
  if (!firstLevel) {
    return null;
  }

  const bestPrice = firstLevel[0];
  let remaining = baseQty;
  let proceeds = 0.0;
  let worstPrice = bestPrice;
  let usedLevels = 0;

  for (const [price, amount] of levels) {
    if (remaining <= 1e-12) {
      break;
    }
    const take = Math.min(amount, remaining);
    proceeds += price * take;
    remaining -= take;
    usedLevels += 1;
    worstPrice = price;
  }

  if (remaining > 1e-12) {
    return null;
  }

  const vwapPrice = proceeds / baseQty;
  const impactPct = ((bestPrice - worstPrice) / bestPrice) * 100.0;

  return {
    baseQty,
    quoteQty: proceeds,
    vwapPrice,
    bestPrice,
    worstPrice,
    levels: usedLevels,
    impactPct,
  };
}

/**
 * Extracts a MarketQuote from an orderbook for a given base quantity.
 *
 * @param orderbook - Orderbook object with bids and asks arrays
 * @param baseQty - Quantity to use for VWAP calculation
 * @returns MarketQuote with VWAP bid and ask, or null if insufficient liquidity
 */
export function quoteFromOrderbook(orderbook: unknown, baseQty: number): MarketQuote | null {
  if (typeof orderbook !== "object" || orderbook === null) {
    return null;
  }

  const ob = orderbook as { bids?: unknown; asks?: unknown };
  const bidPrice = estimateFillFromBase(ob.bids, baseQty);
  const askPrice = estimateFillFromBase(ob.asks, baseQty);

  if (!bidPrice || !askPrice) {
    return null;
  }

  return { bid: bidPrice, ask: askPrice };
}

/**
 * Gets the best bid price from an orderbook.
 *
 * @param bids - Bid levels
 * @returns Best (highest) bid price, or null if no bids
 */
export function bestBid(bids: unknown): number | null {
  const levels = normalizeBids(bids);
  const firstLevel = levels[0];
  return firstLevel ? firstLevel[0] : null;
}

/**
 * Gets the best ask price from an orderbook.
 *
 * @param asks - Ask levels
 * @returns Best (lowest) ask price, or null if no asks
 */
export function bestAsk(asks: unknown): number | null {
  const levels = normalizeAsks(asks);
  const firstLevel = levels[0];
  return firstLevel ? firstLevel[0] : null;
}

/**
 * Calculates the spread percentage between best bid and ask.
 *
 * @param bids - Bid levels
 * @param asks - Ask levels
 * @returns Spread as percentage of mid price, or null if invalid
 */
export function spreadFromOrderbook(bids: unknown, asks: unknown): number | null {
  const bid = bestBid(bids);
  const ask = bestAsk(asks);

  if (!bid || !ask || bid <= 0 || ask <= 0) {
    return null;
  }

  const mid = (bid + ask) / 2;
  return ((ask - bid) / mid) * 100;
}
