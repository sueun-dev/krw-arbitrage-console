/**
 * @fileoverview Main entry point for arbitrage library exports.
 * Re-exports all public APIs from submodules.
 */

// Core types, errors, and constants
export * from "./core/types";
export * from "./core/errors";
export * from "./core/constants";

// Exchange client factories and utilities
export * from "./exchanges";

// Market data and orderbook utilities
// Note: FillAnalysis is defined in both core/types and market/orderbook
// We use the market/orderbook version here with a different name to avoid conflicts
export {
  type Level,
  type FillAnalysis as OrderbookFillAnalysis,
  estimateFillFromBase,
  estimateFillFromQuote,
  analyzeBuyFillFromQuote,
  analyzeSellFillFromBase,
  quoteFromOrderbook,
  bestBid,
  bestAsk,
  spreadFromOrderbook,
} from "./market/orderbook";

// Rate calculations and fees
// Note: UsdtKrwRateContext is also defined in core/types, so we export selectively
export {
  premiumPct,
  applyFee,
  basisPct,
  midPrice,
  spreadPct,
  type TradeSide,
} from "./rates/calculations";
export * from "./rates/fees";

// Transfer and chain utilities
export * from "./transfer";

// HTTP utilities
export * from "./utils";
