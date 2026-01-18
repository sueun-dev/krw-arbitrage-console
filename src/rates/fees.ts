/**
 * @fileoverview Exchange fee constants and utilities.
 * Fee rates are expressed as decimals (e.g., 0.001 = 0.1%).
 */

// Re-export fee constants from core
export {
  BITHUMB_SPOT_TAKER_FEE,
  UPBIT_SPOT_TAKER_FEE,
  GATEIO_SPOT_TAKER_FEE,
  GATEIO_PERP_TAKER_FEE,
  OKX_SPOT_TAKER_FEE,
  OKX_PERP_TAKER_FEE,
  BYBIT_SPOT_TAKER_FEE,
  BYBIT_PERP_TAKER_FEE,
  HYPERLIQUID_SPOT_TAKER_FEE,
  HYPERLIQUID_PERP_TAKER_FEE,
  LIGHTER_SPOT_TAKER_FEE,
  LIGHTER_PERP_TAKER_FEE,
} from "../core/constants";

import {
  BITHUMB_SPOT_TAKER_FEE,
  UPBIT_SPOT_TAKER_FEE,
  GATEIO_SPOT_TAKER_FEE,
  GATEIO_PERP_TAKER_FEE,
  OKX_SPOT_TAKER_FEE,
  OKX_PERP_TAKER_FEE,
  BYBIT_SPOT_TAKER_FEE,
  BYBIT_PERP_TAKER_FEE,
  HYPERLIQUID_SPOT_TAKER_FEE,
  HYPERLIQUID_PERP_TAKER_FEE,
  LIGHTER_SPOT_TAKER_FEE,
  LIGHTER_PERP_TAKER_FEE,
} from "../core/constants";

/** Market type for fee lookup */
export type MarketType = "spot" | "perp";

/** Fee lookup table by exchange and market type */
interface FeeTable {
  spot: number;
  perp: number;
}

const EXCHANGE_FEES: Record<string, FeeTable> = {
  bithumb: { spot: BITHUMB_SPOT_TAKER_FEE, perp: 0 },
  upbit: { spot: UPBIT_SPOT_TAKER_FEE, perp: 0 },
  gateio: { spot: GATEIO_SPOT_TAKER_FEE, perp: GATEIO_PERP_TAKER_FEE },
  okx: { spot: OKX_SPOT_TAKER_FEE, perp: OKX_PERP_TAKER_FEE },
  bybit: { spot: BYBIT_SPOT_TAKER_FEE, perp: BYBIT_PERP_TAKER_FEE },
  hyperliquid: { spot: HYPERLIQUID_SPOT_TAKER_FEE, perp: HYPERLIQUID_PERP_TAKER_FEE },
  lighter: { spot: LIGHTER_SPOT_TAKER_FEE, perp: LIGHTER_PERP_TAKER_FEE },
};

/**
 * Gets the taker fee rate for a given exchange and market type.
 *
 * @param exchange - The exchange name (lowercase)
 * @param marketType - The market type ("spot" or "perp")
 * @returns The fee rate as a decimal, or 0 if not found
 *
 * @example
 * ```typescript
 * getTakerFee("gateio", "spot"); // Returns 0.002 (0.2%)
 * getTakerFee("gateio", "perp"); // Returns 0.0005 (0.05%)
 * ```
 */
export function getTakerFee(exchange: string, marketType: MarketType): number {
  const fees = EXCHANGE_FEES[exchange.toLowerCase()];
  if (!fees) {
    return 0;
  }
  return fees[marketType];
}

/**
 * Gets the combined round-trip fee for a trade (buy + sell).
 *
 * @param exchange - The exchange name (lowercase)
 * @param marketType - The market type ("spot" or "perp")
 * @returns The total round-trip fee rate
 */
export function getRoundTripFee(exchange: string, marketType: MarketType): number {
  return getTakerFee(exchange, marketType) * 2;
}
