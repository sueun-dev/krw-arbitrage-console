/**
 * @fileoverview Core type definitions for the arbitrage application.
 * Uses interfaces for object shapes and type aliases for unions.
 */

// =============================================================================
// Union Types (kept as type aliases per Google style)
// =============================================================================

/**
 * Direction of arbitrage trade.
 * - reverse: KRW -> overseas (domestic premium is negative)
 * - kimchi: overseas -> KRW (domestic premium is positive)
 * - contango: DEX perp vs spot arbitrage
 */
export type Direction = "reverse" | "kimchi" | "contango";

/**
 * Basis trade mode.
 * - entry: Opening a new position
 * - unwind: Closing an existing position
 */
export type BasisMode = "entry" | "unwind";

// =============================================================================
// Market Data Interfaces
// =============================================================================

/**
 * Represents a market quote with bid and ask prices.
 * Bid is the highest price a buyer will pay.
 * Ask is the lowest price a seller will accept.
 */
export interface MarketQuote {
  /** Highest bid price */
  readonly bid: number;
  /** Lowest ask price */
  readonly ask: number;
}

/**
 * Extended market quote with additional market data.
 */
export interface ExtendedMarketQuote extends MarketQuote {
  /** Last traded price */
  readonly lastPrice?: number;
  /** 24-hour trading volume */
  readonly volume24h?: number;
  /** Timestamp of the quote */
  readonly timestamp?: number;
}

/**
 * Orderbook level with price and quantity.
 */
export interface OrderbookLevel {
  /** Price at this level */
  readonly price: number;
  /** Available quantity at this level */
  readonly quantity: number;
}

/**
 * Full orderbook with multiple levels.
 */
export interface Orderbook {
  /** Bid levels (highest first) */
  readonly bids: readonly OrderbookLevel[];
  /** Ask levels (lowest first) */
  readonly asks: readonly OrderbookLevel[];
  /** Timestamp of the orderbook snapshot */
  readonly timestamp?: number;
}

// =============================================================================
// Opportunity Interfaces
// =============================================================================

/**
 * Represents an arbitrage opportunity with premium details.
 */
export interface PremiumOpportunity {
  /** Trading pair base coin (e.g., "BTC", "ETH") */
  readonly coin: string;
  /** Direction of the arbitrage */
  readonly direction: Direction;
  /** Premium percentage (positive = domestic premium) */
  readonly premiumPct: number;
  /** Domestic price in KRW */
  readonly domesticPrice: number;
  /** Overseas price in USDT */
  readonly overseasPrice: number;
  /** USDT/KRW exchange rate used */
  readonly usdtKrw: number;
}

/**
 * DEX market information for contango arbitrage.
 */
export interface DexMarketInfo {
  /** Symbol/pair name on the DEX */
  readonly symbol: string;
  /** Base currency (e.g., "BTC") */
  readonly base: string;
  /** Quote currency (e.g., "USD") */
  readonly quote: string;
  /** Best bid price */
  readonly bid: number;
  /** Best ask price */
  readonly ask: number;
  /** Last traded price */
  readonly lastPrice: number;
  /** Current funding rate (for perpetuals) */
  readonly fundingRate?: number;
  /** Open interest */
  readonly openInterest?: number;
}

/**
 * Result from a DEX API fetch operation.
 */
export interface DexApiResult {
  /** DEX exchange name */
  readonly exchange: string;
  /** Map of symbol to market info */
  readonly markets: Readonly<Record<string, DexMarketInfo>>;
  /** Timestamp of the fetch */
  readonly timestamp: number;
}

// =============================================================================
// Transfer Interfaces
// =============================================================================

/**
 * Information about a blockchain network for transfers.
 */
export interface ChainInfo {
  /** Chain/network name (e.g., "ERC20", "TRC20", "SOL") */
  readonly name: string;
  /** Whether deposits are enabled (null if unknown) */
  readonly depositOk: boolean | null;
  /** Whether withdrawals are enabled (null if unknown) */
  readonly withdrawOk: boolean | null;
  /** Number of confirmations required (null if unknown) */
  readonly confirmations: number | null;
  /** Withdrawal fee in coin units (optional) */
  readonly withdrawFee?: number | null;
  /** Minimum withdrawal amount (optional) */
  readonly withdrawMin?: number | null;
}

/**
 * Transfer status for a coin on an exchange.
 */
export interface TransferStatus {
  /** Exchange name */
  readonly exchange: string;
  /** Coin/token symbol */
  readonly coin: string;
  /** Whether any deposit method is available (null if unknown) */
  readonly depositOk: boolean | null;
  /** Whether any withdrawal method is available (null if unknown) */
  readonly withdrawOk: boolean | null;
  /** List of available chain names */
  readonly chains: readonly string[];
  /** Detailed info for each chain */
  readonly chainInfo: readonly ChainInfo[];
}

// =============================================================================
// Rate Interfaces
// =============================================================================

/**
 * USDT/KRW rate context with source information.
 */
export interface UsdtKrwRateContext {
  /** Display label for the rate source */
  readonly label: string;
  /** The USDT/KRW exchange rate */
  readonly usdtKrw: number;
  /** Premium percentage of USDT over USD/KRW (if applicable) */
  readonly usdtPremiumPct: number;
  /** Source of the rate */
  readonly premiumSource: string;
  /** External USD/KRW FX rate */
  readonly fxUsdKrw: number;
  /** Domestic exchange USDT/KRW rate */
  readonly domesticUsdtKrw: number;
}

// =============================================================================
// Orderbook Analysis Interfaces
// =============================================================================

/**
 * Result of orderbook fill analysis.
 */
export interface FillAnalysis {
  /** Total base quantity that can be filled */
  readonly baseQty: number;
  /** Total quote value of the fill */
  readonly quoteValue: number;
  /** Volume-weighted average price */
  readonly vwap: number;
  /** Number of levels consumed */
  readonly levelsUsed: number;
  /** Whether the entire requested amount can be filled */
  readonly fullyFilled: boolean;
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Checks if a quote has valid positive bid and ask prices.
 *
 * @param quote - The market quote to validate
 * @returns True if both bid and ask are positive
 */
export function isValidQuote(quote: MarketQuote): boolean {
  return quote.bid > 0 && quote.ask > 0;
}

/**
 * Checks if a value is a valid Direction.
 *
 * @param value - The value to check
 * @returns True if value is a valid Direction
 */
export function isDirection(value: unknown): value is Direction {
  return value === "reverse" || value === "kimchi" || value === "contango";
}

/**
 * Checks if a value is a valid BasisMode.
 *
 * @param value - The value to check
 * @returns True if value is a valid BasisMode
 */
export function isBasisMode(value: unknown): value is BasisMode {
  return value === "entry" || value === "unwind";
}
