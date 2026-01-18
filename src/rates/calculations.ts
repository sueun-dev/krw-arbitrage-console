/**
 * @fileoverview Price calculation utilities for arbitrage analysis.
 */

/** Side of a trade for fee application */
export type TradeSide = "buy" | "sell";

/**
 * Calculates the premium percentage between domestic and overseas prices.
 *
 * Premium% = ((domesticKRW - (overseasUSDT × USDT/KRW)) / (overseasUSDT × USDT/KRW)) × 100
 *
 * @param domesticPriceKrw - The domestic price in Korean Won
 * @param overseasPriceUsdt - The overseas price in USDT
 * @param usdtKrw - The USDT/KRW exchange rate
 * @returns The premium percentage (positive = domestic premium, negative = discount)
 * @throws {Error} If any input is not positive
 *
 * @example
 * ```typescript
 * const premium = premiumPct(1050000, 1000, 1000);
 * // Returns 5.0 (5% domestic premium)
 * ```
 */
export function premiumPct(
  domesticPriceKrw: number,
  overseasPriceUsdt: number,
  usdtKrw: number
): number {
  if (domesticPriceKrw <= 0) {
    throw new Error("domesticPriceKrw must be > 0");
  }
  if (overseasPriceUsdt <= 0) {
    throw new Error("overseasPriceUsdt must be > 0");
  }
  if (usdtKrw <= 0) {
    throw new Error("usdtKrw must be > 0");
  }

  const overseasKrw = overseasPriceUsdt * usdtKrw;
  return ((domesticPriceKrw - overseasKrw) / overseasKrw) * 100.0;
}

/**
 * Applies a fee rate to a price based on trade side.
 *
 * - Buy side: price increases by fee rate (you pay more)
 * - Sell side: price decreases by fee rate (you receive less)
 *
 * @param price - The original price
 * @param feeRate - The fee rate as a decimal (e.g., 0.001 for 0.1%)
 * @param side - The trade side ("buy" or "sell")
 * @returns The fee-adjusted price
 * @throws {Error} If price is not positive or feeRate is negative
 *
 * @example
 * ```typescript
 * applyFee(1000, 0.001, "buy");  // Returns 1001 (price + 0.1%)
 * applyFee(1000, 0.001, "sell"); // Returns 999 (price - 0.1%)
 * ```
 */
export function applyFee(price: number, feeRate: number, side: TradeSide): number {
  if (price <= 0) {
    throw new Error("price must be > 0");
  }
  if (feeRate < 0) {
    throw new Error("feeRate must be >= 0");
  }

  if (side === "buy") {
    return price * (1.0 + feeRate);
  }
  if (side === "sell") {
    return price * (1.0 - feeRate);
  }

  // Exhaustive check - TypeScript will error if new side is added
  const exhaustiveCheck: never = side;
  throw new Error(`Unknown trade side: ${exhaustiveCheck}`);
}

/**
 * Calculates the basis percentage between spot and perpetual prices.
 *
 * Basis% = |perpPrice - spotPrice| / spotPrice × 100
 *
 * @param spotExecPrice - The spot execution price
 * @param perpExecPrice - The perpetual execution price
 * @returns The absolute basis percentage
 * @throws {Error} If any price is not positive
 *
 * @example
 * ```typescript
 * basisPct(1000, 1010); // Returns 1.0 (1% basis)
 * ```
 */
export function basisPct(spotExecPrice: number, perpExecPrice: number): number {
  if (spotExecPrice <= 0) {
    throw new Error("spotExecPrice must be > 0");
  }
  if (perpExecPrice <= 0) {
    throw new Error("perpExecPrice must be > 0");
  }

  return (Math.abs(perpExecPrice - spotExecPrice) / spotExecPrice) * 100.0;
}

/**
 * Calculates the mid price between bid and ask.
 *
 * Falls back to available price if one side is missing.
 *
 * @param bid - The bid price (can be 0 if unavailable)
 * @param ask - The ask price (can be 0 if unavailable)
 * @returns The mid price, or 0 if both are unavailable
 *
 * @example
 * ```typescript
 * midPrice(100, 102); // Returns 101
 * midPrice(100, 0);   // Returns 100 (fallback to bid)
 * midPrice(0, 102);   // Returns 102 (fallback to ask)
 * ```
 */
export function midPrice(bid: number, ask: number): number {
  if (bid > 0 && ask > 0) {
    return (bid + ask) / 2.0;
  }
  if (bid > 0) {
    return bid;
  }
  if (ask > 0) {
    return ask;
  }
  return 0.0;
}

/**
 * Calculates the spread percentage between bid and ask.
 *
 * Spread% = (ask - bid) / mid × 100
 *
 * @param bid - The bid price
 * @param ask - The ask price
 * @returns The spread percentage, or 0 if prices are invalid
 */
export function spreadPct(bid: number, ask: number): number {
  if (bid <= 0 || ask <= 0) {
    return 0;
  }
  const mid = (bid + ask) / 2.0;
  if (mid <= 0) {
    return 0;
  }
  return ((ask - bid) / mid) * 100.0;
}
