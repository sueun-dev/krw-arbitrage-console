/**
 * @fileoverview Exchange client factory functions using CCXT.
 * Provides standardized exchange initialization with optional authentication.
 */

import ccxt from "ccxt";
import type { Exchange } from "ccxt";
import { ConfigurationError } from "../core/errors";

// =============================================================================
// Configuration Types
// =============================================================================

/** Default timeout for exchange API calls */
const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Exchange initialization options.
 */
export interface ExchangeOptions {
  /** Whether API keys are required */
  requireKeys?: boolean;
  /** Whether to use public API only (no authentication) */
  usePublicApi?: boolean;
  /** Custom timeout in milliseconds */
  timeout?: number;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Gets an environment variable from multiple possible names.
 *
 * @param names - Environment variable names to check in order
 * @returns The first non-empty value found, or empty string
 */
function getEnv(...names: string[]): string {
  for (const name of names) {
    const value = (process.env[name] ?? "").trim();
    if (value) {
      return value;
    }
  }
  return "";
}

/**
 * Creates base CCXT exchange parameters.
 */
function baseParams(timeout?: number): Record<string, unknown> {
  return {
    enableRateLimit: true,
    timeout: timeout ?? DEFAULT_TIMEOUT_MS,
  };
}

// =============================================================================
// Domestic Exchange Factories (KRW)
// =============================================================================

/**
 * Creates a Bithumb exchange instance.
 *
 * @param options - Exchange options
 * @returns Initialized Bithumb exchange
 * @throws {ConfigurationError} When keys are required but missing
 */
export async function createBithumb(options: ExchangeOptions = {}): Promise<Exchange> {
  const { requireKeys = false, timeout } = options;
  const apiKey = getEnv("BITHUMB_API_KEY");
  const secret = getEnv("BITHUMB_API_SECRET", "BITHUMB_SECRET_KEY");

  if (requireKeys && !(apiKey && secret)) {
    throw new ConfigurationError(
      "BITHUMB_API_KEY",
      "Missing Bithumb API keys (BITHUMB_API_KEY / BITHUMB_API_SECRET)"
    );
  }

  const params: Record<string, unknown> = baseParams(timeout);
  if (apiKey && secret) {
    params.apiKey = apiKey;
    params.secret = secret;
  }

  const exchange = new (ccxt as unknown as { bithumb: new (params: unknown) => Exchange }).bithumb(params);
  await exchange.loadMarkets();
  return exchange;
}

/**
 * Creates an Upbit exchange instance.
 *
 * @param options - Exchange options
 * @returns Initialized Upbit exchange
 * @throws {ConfigurationError} When keys are required but missing
 */
export async function createUpbit(options: ExchangeOptions = {}): Promise<Exchange> {
  const { requireKeys = false, timeout } = options;
  const apiKey = getEnv("UPBIT_API_KEY", "UPBIT_ACCESS_KEY");
  const secret = getEnv("UPBIT_API_SECRET", "UPBIT_SECRET_KEY");

  if (requireKeys && !(apiKey && secret)) {
    throw new ConfigurationError(
      "UPBIT_API_KEY",
      "Missing Upbit API keys (UPBIT_API_KEY / UPBIT_API_SECRET)"
    );
  }

  const params: Record<string, unknown> = baseParams(timeout);
  if (apiKey && secret) {
    params.apiKey = apiKey;
    params.secret = secret;
  }

  const exchange = new (ccxt as unknown as { upbit: new (params: unknown) => Exchange }).upbit(params);
  await exchange.loadMarkets();
  return exchange;
}

// =============================================================================
// Overseas Exchange Factories (USDT)
// =============================================================================

/**
 * Creates a GateIO spot exchange instance.
 *
 * @param options - Exchange options
 * @returns Initialized GateIO spot exchange
 */
export async function createGateioSpot(options: ExchangeOptions = {}): Promise<Exchange> {
  const { requireKeys = false, usePublicApi = false, timeout } = options;
  const apiKey = getEnv("GATEIO_API_KEY");
  const secret = getEnv("GATEIO_API_SECRET");

  if (requireKeys && !usePublicApi && !(apiKey && secret)) {
    throw new ConfigurationError(
      "GATEIO_API_KEY",
      "Missing GateIO API keys (GATEIO_API_KEY / GATEIO_API_SECRET)"
    );
  }

  const params: Record<string, unknown> = {
    ...baseParams(timeout),
    options: { defaultType: "spot" },
  };
  if (!usePublicApi && apiKey && secret) {
    params.apiKey = apiKey;
    params.secret = secret;
  }

  const exchange = new (ccxt as unknown as { gateio: new (params: unknown) => Exchange }).gateio(params);
  await exchange.loadMarkets();
  return exchange;
}

/**
 * Creates a GateIO perpetual exchange instance.
 *
 * @param options - Exchange options
 * @returns Initialized GateIO perpetual exchange
 */
export async function createGateioPerp(options: ExchangeOptions = {}): Promise<Exchange> {
  const { requireKeys = false, usePublicApi = false, timeout } = options;
  const apiKey = getEnv("GATEIO_API_KEY");
  const secret = getEnv("GATEIO_API_SECRET");

  if (requireKeys && !usePublicApi && !(apiKey && secret)) {
    throw new ConfigurationError(
      "GATEIO_API_KEY",
      "Missing GateIO API keys (GATEIO_API_KEY / GATEIO_API_SECRET)"
    );
  }

  const params: Record<string, unknown> = {
    ...baseParams(timeout),
    options: { defaultType: "swap" },
  };
  if (!usePublicApi && apiKey && secret) {
    params.apiKey = apiKey;
    params.secret = secret;
  }

  const exchange = new (ccxt as unknown as { gateio: new (params: unknown) => Exchange }).gateio(params);
  await exchange.loadMarkets();
  return exchange;
}

/**
 * Creates a Bybit spot exchange instance.
 */
export async function createBybitSpot(options: ExchangeOptions = {}): Promise<Exchange> {
  const { requireKeys = false, timeout } = options;
  const apiKey = getEnv("BYBIT_API_KEY");
  const secret = getEnv("BYBIT_API_SECRET");

  if (requireKeys && !(apiKey && secret)) {
    throw new ConfigurationError(
      "BYBIT_API_KEY",
      "Missing Bybit API keys (BYBIT_API_KEY / BYBIT_API_SECRET)"
    );
  }

  const params: Record<string, unknown> = {
    ...baseParams(timeout),
    options: { defaultType: "spot" },
  };
  if (apiKey && secret) {
    params.apiKey = apiKey;
    params.secret = secret;
  }

  const exchange = new (ccxt as unknown as { bybit: new (params: unknown) => Exchange }).bybit(params);
  await exchange.loadMarkets();
  return exchange;
}

/**
 * Creates a Bybit perpetual exchange instance.
 */
export async function createBybitPerp(options: ExchangeOptions = {}): Promise<Exchange> {
  const { requireKeys = false, timeout } = options;
  const apiKey = getEnv("BYBIT_API_KEY");
  const secret = getEnv("BYBIT_API_SECRET");

  if (requireKeys && !(apiKey && secret)) {
    throw new ConfigurationError(
      "BYBIT_API_KEY",
      "Missing Bybit API keys (BYBIT_API_KEY / BYBIT_API_SECRET)"
    );
  }

  const params: Record<string, unknown> = {
    ...baseParams(timeout),
    options: { defaultType: "swap" },
  };
  if (apiKey && secret) {
    params.apiKey = apiKey;
    params.secret = secret;
  }

  const exchange = new (ccxt as unknown as { bybit: new (params: unknown) => Exchange }).bybit(params);
  await exchange.loadMarkets();
  return exchange;
}

/**
 * Creates an OKX spot exchange instance.
 */
export async function createOkxSpot(options: ExchangeOptions = {}): Promise<Exchange> {
  const { requireKeys = false, timeout } = options;
  const apiKey = getEnv("OKX_API_KEY");
  const secret = getEnv("OKX_API_SECRET");
  const passphrase = getEnv("OKX_API_PASSPHRASE", "OKX_PASSPHRASE");

  if (requireKeys && !(apiKey && secret && passphrase)) {
    throw new ConfigurationError(
      "OKX_API_KEY",
      "Missing OKX API keys (OKX_API_KEY / OKX_API_SECRET / OKX_API_PASSPHRASE)"
    );
  }

  const params: Record<string, unknown> = {
    ...baseParams(timeout),
    options: { defaultType: "spot" },
  };
  if (apiKey && secret && passphrase) {
    params.apiKey = apiKey;
    params.secret = secret;
    params.password = passphrase;
  }

  const exchange = new (ccxt as unknown as { okx: new (params: unknown) => Exchange }).okx(params);
  await exchange.loadMarkets();
  return exchange;
}

/**
 * Creates an OKX perpetual exchange instance.
 */
export async function createOkxPerp(options: ExchangeOptions = {}): Promise<Exchange> {
  const { requireKeys = false, timeout } = options;
  const apiKey = getEnv("OKX_API_KEY");
  const secret = getEnv("OKX_API_SECRET");
  const passphrase = getEnv("OKX_API_PASSPHRASE", "OKX_PASSPHRASE");

  if (requireKeys && !(apiKey && secret && passphrase)) {
    throw new ConfigurationError(
      "OKX_API_KEY",
      "Missing OKX API keys (OKX_API_KEY / OKX_API_SECRET / OKX_API_PASSPHRASE)"
    );
  }

  const params: Record<string, unknown> = {
    ...baseParams(timeout),
    options: { defaultType: "swap" },
  };
  if (apiKey && secret && passphrase) {
    params.apiKey = apiKey;
    params.secret = secret;
    params.password = passphrase;
  }

  const exchange = new (ccxt as unknown as { okx: new (params: unknown) => Exchange }).okx(params);
  await exchange.loadMarkets();
  return exchange;
}

/**
 * Creates a Hyperliquid spot exchange instance.
 */
export async function createHyperliquidSpot(options: ExchangeOptions = {}): Promise<Exchange> {
  const { requireKeys = false, timeout } = options;
  const walletAddress = getEnv("HYPERLIQUID_WALLET_ADDRESS");
  const privateKey = getEnv("HYPERLIQUID_PRIVATE_KEY");

  if (requireKeys && !(walletAddress && privateKey)) {
    throw new ConfigurationError(
      "HYPERLIQUID_WALLET_ADDRESS",
      "Missing Hyperliquid keys (HYPERLIQUID_WALLET_ADDRESS / HYPERLIQUID_PRIVATE_KEY)"
    );
  }

  const params: Record<string, unknown> = {
    ...baseParams(timeout),
    options: { defaultType: "spot" },
  };
  if (walletAddress && privateKey) {
    params.walletAddress = walletAddress;
    params.privateKey = privateKey;
  }

  const exchange = new (ccxt as unknown as { hyperliquid: new (params: unknown) => Exchange }).hyperliquid(params);
  await exchange.loadMarkets();
  return exchange;
}

/**
 * Creates a Hyperliquid perpetual exchange instance.
 */
export async function createHyperliquidPerp(options: ExchangeOptions = {}): Promise<Exchange> {
  const { requireKeys = false, timeout } = options;
  const walletAddress = getEnv("HYPERLIQUID_WALLET_ADDRESS");
  const privateKey = getEnv("HYPERLIQUID_PRIVATE_KEY");

  if (requireKeys && !(walletAddress && privateKey)) {
    throw new ConfigurationError(
      "HYPERLIQUID_WALLET_ADDRESS",
      "Missing Hyperliquid keys (HYPERLIQUID_WALLET_ADDRESS / HYPERLIQUID_PRIVATE_KEY)"
    );
  }

  const params: Record<string, unknown> = {
    ...baseParams(timeout),
    options: { defaultType: "swap" },
  };
  if (walletAddress && privateKey) {
    params.walletAddress = walletAddress;
    params.privateKey = privateKey;
  }

  const exchange = new (ccxt as unknown as { hyperliquid: new (params: unknown) => Exchange }).hyperliquid(params);
  await exchange.loadMarkets();
  return exchange;
}

// =============================================================================
// DEX Exchange Factories
// =============================================================================

/**
 * Creates a dYdX perpetual exchange instance.
 */
export async function createDydxPerp(options: ExchangeOptions = {}): Promise<Exchange> {
  const { requireKeys = false, timeout } = options;
  const apiKey = getEnv("DYDX_API_KEY");
  const secret = getEnv("DYDX_API_SECRET");
  const passphrase = getEnv("DYDX_API_PASSPHRASE");

  if (requireKeys && !(apiKey && secret && passphrase)) {
    throw new ConfigurationError(
      "DYDX_API_KEY",
      "Missing dYdX API keys (DYDX_API_KEY / DYDX_API_SECRET / DYDX_API_PASSPHRASE)"
    );
  }

  const params: Record<string, unknown> = {
    ...baseParams(timeout),
    options: { defaultType: "swap" },
  };
  if (apiKey && secret && passphrase) {
    params.apiKey = apiKey;
    params.secret = secret;
    params.password = passphrase;
  }

  const exchange = new (ccxt as unknown as { dydx: new (params: unknown) => Exchange }).dydx(params);
  await exchange.loadMarkets();
  return exchange;
}

/**
 * Creates a Paradex perpetual exchange instance.
 */
export async function createParadexPerp(options: ExchangeOptions = {}): Promise<Exchange> {
  const { requireKeys = false, timeout } = options;
  const apiKey = getEnv("PARADEX_API_KEY");
  const secret = getEnv("PARADEX_API_SECRET");

  if (requireKeys && !(apiKey && secret)) {
    throw new ConfigurationError(
      "PARADEX_API_KEY",
      "Missing Paradex API keys (PARADEX_API_KEY / PARADEX_API_SECRET)"
    );
  }

  const params: Record<string, unknown> = {
    ...baseParams(timeout),
    options: { defaultType: "swap" },
  };
  if (apiKey && secret) {
    params.apiKey = apiKey;
    params.secret = secret;
  }

  const exchange = new (ccxt as unknown as { paradex: new (params: unknown) => Exchange }).paradex(params);
  await exchange.loadMarkets();
  return exchange;
}

/**
 * Creates a Backpack perpetual exchange instance.
 */
export async function createBackpackPerp(options: ExchangeOptions = {}): Promise<Exchange> {
  const { requireKeys = false, timeout } = options;
  const apiKey = getEnv("BACKPACK_API_KEY");
  const secret = getEnv("BACKPACK_API_SECRET");

  if (requireKeys && !(apiKey && secret)) {
    throw new ConfigurationError(
      "BACKPACK_API_KEY",
      "Missing Backpack API keys (BACKPACK_API_KEY / BACKPACK_API_SECRET)"
    );
  }

  const params: Record<string, unknown> = {
    ...baseParams(timeout),
    options: { defaultType: "swap" },
  };
  if (apiKey && secret) {
    params.apiKey = apiKey;
    params.secret = secret;
  }

  const exchange = new (ccxt as unknown as { backpack: new (params: unknown) => Exchange }).backpack(params);
  await exchange.loadMarkets();
  return exchange;
}

// =============================================================================
// DEX Exchange Types and Lists
// =============================================================================

/**
 * DEX exchange identifier type.
 */
export type DexExchange =
  | "hyperliquid"
  | "dydx"
  | "paradex"
  | "lighter"
  | "backpack"
  | "apex"
  | "defx"
  | "woofipro"
  | "modetrade"
  | "hibachi"
  | "delta"
  // Custom REST API implementations
  | "vertex"
  | "drift"
  | "gmx"
  | "jupiter"
  | "edgex"
  | "grvt"
  | "extended"
  | "pacifica"
  | "reya"
  | "nado"
  | "varational"
  | "ostium";

/** CCXT-supported DEX perpetual exchanges */
export const DEX_EXCHANGES_CCXT: readonly DexExchange[] = [
  "hyperliquid",
  "dydx",
  "paradex",
  "lighter",
  "backpack",
  "apex",
  "defx",
  "woofipro",
  "modetrade",
  "hibachi",
  "delta",
] as const;

/** Custom REST API DEX exchanges (non-CCXT) */
export const DEX_EXCHANGES_CUSTOM: readonly DexExchange[] = [
  "vertex",
  "drift",
  "gmx",
  "jupiter",
  "edgex",
  "grvt",
  "extended",
  "pacifica",
  "reya",
  "nado",
  "varational",
  "ostium",
] as const;

/** All DEX exchanges */
export const DEX_EXCHANGES: readonly DexExchange[] = [
  ...DEX_EXCHANGES_CCXT,
  ...DEX_EXCHANGES_CUSTOM,
] as const;

/**
 * Type guard for DEX exchange names.
 */
export function isDexExchange(exchange: string): exchange is DexExchange {
  return DEX_EXCHANGES.includes(exchange as DexExchange);
}

/**
 * Checks if an exchange is CCXT-supported.
 */
export function isCcxtDexExchange(exchange: string): boolean {
  return DEX_EXCHANGES_CCXT.includes(exchange as DexExchange);
}

/**
 * Checks if an exchange uses custom REST API.
 */
export function isCustomDexExchange(exchange: string): boolean {
  return DEX_EXCHANGES_CUSTOM.includes(exchange as DexExchange);
}
