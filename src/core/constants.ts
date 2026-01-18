/**
 * @fileoverview Global constants for the arbitrage application.
 * Organized by category for maintainability.
 */

// =============================================================================
// Exchange Fee Rates (Taker fees as decimal percentages)
// =============================================================================

/** Bithumb spot taker fee: 0.04% */
export const BITHUMB_SPOT_TAKER_FEE = 0.0004;

/** Upbit spot taker fee: 0.05% */
export const UPBIT_SPOT_TAKER_FEE = 0.0005;

/** GateIO spot taker fee: 0.2% */
export const GATEIO_SPOT_TAKER_FEE = 0.002;

/** GateIO perpetual taker fee: 0.05% */
export const GATEIO_PERP_TAKER_FEE = 0.0005;

/** OKX spot taker fee: 0.1% */
export const OKX_SPOT_TAKER_FEE = 0.001;

/** OKX perpetual taker fee: 0.05% */
export const OKX_PERP_TAKER_FEE = 0.0005;

/** Bybit spot taker fee: 0.1% */
export const BYBIT_SPOT_TAKER_FEE = 0.001;

/** Bybit perpetual taker fee: 0.06% */
export const BYBIT_PERP_TAKER_FEE = 0.0006;

/** Hyperliquid spot taker fee: 0.07% */
export const HYPERLIQUID_SPOT_TAKER_FEE = 0.0007;

/** Hyperliquid perpetual taker fee: 0.045% */
export const HYPERLIQUID_PERP_TAKER_FEE = 0.00045;

/** Lighter spot taker fee: 0% (maker/taker rebate model) */
export const LIGHTER_SPOT_TAKER_FEE = 0.0;

/** Lighter perpetual taker fee: 0% (maker/taker rebate model) */
export const LIGHTER_PERP_TAKER_FEE = 0.0;

// =============================================================================
// WebSocket Configuration
// =============================================================================

/** Default staleness threshold in milliseconds */
export const DEFAULT_STALE_MS = 10_000;

/** Bithumb orderbook depth for WebSocket subscription */
export const DEFAULT_BITHUMB_DEPTH = 5;

/** Default batch size for WebSocket subscriptions */
export const DEFAULT_WS_BATCH = 100;

/** Upbit WebSocket subscription batch size */
export const DEFAULT_UPBIT_BATCH = 100;

/** Bybit WebSocket subscription batch size */
export const DEFAULT_BYBIT_BATCH = 10;

/** OKX WebSocket subscription batch size */
export const DEFAULT_OKX_BATCH = 20;

/** Hyperliquid WebSocket subscription batch size */
export const DEFAULT_HYPERLIQUID_BATCH = 50;

/** Lighter WebSocket subscription batch size */
export const DEFAULT_LIGHTER_BATCH = 50;

// =============================================================================
// WebSocket URLs
// =============================================================================

/** GateIO Spot WebSocket URL */
export const GATEIO_SPOT_WS_URL = "wss://api.gateio.ws/ws/v4/";

/** GateIO Futures WebSocket URL */
export const GATEIO_FUTURES_WS_URL = "wss://fx-ws.gateio.ws/v4/ws/usdt";

/** Bithumb WebSocket URL */
export const BITHUMB_WS_URL = "wss://pubwss.bithumb.com/pub/ws";

/** Upbit WebSocket URL */
export const UPBIT_WS_URL = "wss://api.upbit.com/websocket/v1";

/** Bybit Spot WebSocket URL */
export const BYBIT_SPOT_WS_URL = "wss://stream.bybit.com/v5/public/spot";

/** Bybit Linear (perpetual) WebSocket URL */
export const BYBIT_LINEAR_WS_URL = "wss://stream.bybit.com/v5/public/linear";

/** OKX Public WebSocket URL */
export const OKX_PUBLIC_WS_URL = "wss://ws.okx.com:8443/ws/v5/public";

/** Hyperliquid WebSocket URL */
export const HYPERLIQUID_WS_URL = "wss://api.hyperliquid.xyz/ws";

/** Lighter WebSocket URL */
export const LIGHTER_WS_URL = "wss://mainnet.zklighter.elliot.ai/stream";

// =============================================================================
// DEX API URLs
// =============================================================================

/** Drift Protocol DLOB API base URL */
export const DRIFT_DLOB_API = "https://dlob.drift.trade";

/** GMX Arbitrum API base URL */
export const GMX_ARBITRUM_API = "https://arbitrum-api.gmxinfra.io";

/** GRVT Market Data API base URL */
export const GRVT_MARKET_DATA_API = "https://market-data.grvt.io";

/** Reya API base URL */
export const REYA_API = "https://api.reya.xyz";

/** Nado Testnet API base URL */
export const NADO_TESTNET_API = "https://archive.test.nado.xyz/v2";

/** Ostium API base URL */
export const OSTIUM_API = "https://metadata-backend.ostium.io";

/** Extended Exchange API base URL */
export const EXTENDED_API = "https://api.starknet.extended.exchange/api/v1";

/** Pacifica API base URL */
export const PACIFICA_API = "https://api.pacifica.fi/api/v1";

// =============================================================================
// Flow/Scanner Defaults
// =============================================================================

/** Default orderbook depth for analysis */
export const DEFAULT_ORDERBOOK_DEPTH = 20;

/** Default number of opportunities to scan */
export const DEFAULT_SCAN_LIMIT = 30;

/** Default concurrent API calls during scanning */
export const DEFAULT_SCAN_CONCURRENCY = 12;

/** Default watch interval in seconds */
export const DEFAULT_WATCH_INTERVAL_SEC = 1;

/** Default notional amount in KRW for analysis */
export const DEFAULT_WATCH_NOTIONAL_KRW = 5_000_000;

/** Default symbol cache TTL in milliseconds (24 hours) */
export const DEFAULT_SYMBOL_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Default maximum basis percentage for B2G (reverse) trades */
export const DEFAULT_B2G_BASIS_MAX_PCT = 0.2;

/** Default maximum basis percentage for G2B (kimchi) trades */
export const DEFAULT_G2B_BASIS_MAX_PCT = 0.2;

/** Default limit for cycle leg opportunities */
export const DEFAULT_CYCLE_LEG_LIMIT = 50;

// =============================================================================
// Web Server Defaults
// =============================================================================

/** Maximum rows per exchange pair in auto mode */
export const AUTO_MAX_ROWS_PER_PAIR = 200;

/** Maximum total rows across all pairs in auto mode */
export const AUTO_MAX_ROWS_TOTAL = 400;

/** Default web server port */
export const DEFAULT_PORT = 5177;

// =============================================================================
// Symbol Cache Configuration
// =============================================================================

/** Symbol cache version for invalidation */
export const SYMBOL_CACHE_VERSION = 2;

/** Symbol cache filename */
export const SYMBOL_CACHE_FILENAME = "arbitrage_symbols.json";

/** Default maximum age for symbol cache in seconds (24 hours) */
export const DEFAULT_SYMBOL_CACHE_MAX_AGE_SECONDS = 60 * 60 * 24;

// =============================================================================
// Environment Variable Names
// =============================================================================

/** Environment variable for runtime directory */
export const ENV_RUNTIME_DIR = "OEH_RUNTIME_DIR";

/** Environment variable for USDT/KRW rate source */
export const ENV_RATE_SOURCE = "USDT_KRW_RATE_SOURCE";

/** Environment variable for USDT/KRW rate override */
export const ENV_RATE_OVERRIDE = "USDT_KRW_RATE_OVERRIDE";

/** Environment variable for USDT premium source */
export const ENV_PREMIUM_SOURCE = "USDT_PREMIUM_SOURCE";

// =============================================================================
// Exchange Lists
// =============================================================================

/** Supported domestic (KRW) exchanges */
export const DOMESTIC_EXCHANGES = ["bithumb", "upbit"] as const;

/** Supported overseas exchanges */
export const OVERSEAS_EXCHANGES = ["gateio", "bybit", "okx", "hyperliquid", "lighter"] as const;

/** Type for domestic exchange names */
export type DomesticExchange = (typeof DOMESTIC_EXCHANGES)[number];

/** Type for overseas exchange names */
export type OverseasExchange = (typeof OVERSEAS_EXCHANGES)[number];
