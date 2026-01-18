import ccxt from "ccxt";
import type { Exchange } from "ccxt";

function getEnv(...names: string[]): string {
  for (const name of names) {
    const value = (process.env[name] ?? "").trim();
    if (value) return value;
  }
  return "";
}

export async function createBithumb(requireKeys: boolean): Promise<Exchange> {
  const apiKey = getEnv("BITHUMB_API_KEY");
  const secret = getEnv("BITHUMB_API_SECRET", "BITHUMB_SECRET_KEY");
  if (requireKeys && !(apiKey && secret)) throw new Error("Missing Bithumb API keys (BITHUMB_API_KEY / BITHUMB_API_SECRET).");

  const params: any = { enableRateLimit: true, timeout: 30000 };
  if (apiKey && secret) params.apiKey = apiKey, params.secret = secret;
  const ex: any = new (ccxt as any).bithumb(params);
  await ex.loadMarkets();
  return ex as Exchange;
}

export async function createGateioSpot(requireKeys: boolean, usePublicApi: boolean): Promise<Exchange> {
  const apiKey = getEnv("GATEIO_API_KEY");
  const secret = getEnv("GATEIO_API_SECRET");
  if (requireKeys && !usePublicApi && !(apiKey && secret)) throw new Error("Missing GateIO API keys (GATEIO_API_KEY / GATEIO_API_SECRET).");

  const params: any = { enableRateLimit: true, timeout: 30000, options: { defaultType: "spot" } };
  if (!usePublicApi && apiKey && secret) params.apiKey = apiKey, params.secret = secret;
  const ex: any = new (ccxt as any).gateio(params);
  await ex.loadMarkets();
  return ex as Exchange;
}

export async function createGateioPerp(requireKeys: boolean, usePublicApi: boolean): Promise<Exchange> {
  const apiKey = getEnv("GATEIO_API_KEY");
  const secret = getEnv("GATEIO_API_SECRET");
  if (requireKeys && !usePublicApi && !(apiKey && secret)) throw new Error("Missing GateIO API keys (GATEIO_API_KEY / GATEIO_API_SECRET).");

  const params: any = { enableRateLimit: true, timeout: 30000, options: { defaultType: "swap" } };
  if (!usePublicApi && apiKey && secret) params.apiKey = apiKey, params.secret = secret;
  const ex: any = new (ccxt as any).gateio(params);
  await ex.loadMarkets();
  return ex as Exchange;
}

export async function createUpbit(requireKeys: boolean): Promise<Exchange> {
  const apiKey = getEnv("UPBIT_API_KEY", "UPBIT_ACCESS_KEY");
  const secret = getEnv("UPBIT_API_SECRET", "UPBIT_SECRET_KEY");
  if (requireKeys && !(apiKey && secret)) throw new Error("Missing Upbit API keys (UPBIT_API_KEY / UPBIT_API_SECRET).");

  const params: any = { enableRateLimit: true, timeout: 30000 };
  if (apiKey && secret) params.apiKey = apiKey, params.secret = secret;
  const ex: any = new (ccxt as any).upbit(params);
  await ex.loadMarkets();
  return ex as Exchange;
}

export async function createBybitSpot(requireKeys: boolean): Promise<Exchange> {
  const apiKey = getEnv("BYBIT_API_KEY");
  const secret = getEnv("BYBIT_API_SECRET");
  if (requireKeys && !(apiKey && secret)) throw new Error("Missing Bybit API keys (BYBIT_API_KEY / BYBIT_API_SECRET).");

  const params: any = { enableRateLimit: true, timeout: 30000, options: { defaultType: "spot" } };
  if (apiKey && secret) params.apiKey = apiKey, params.secret = secret;
  const ex: any = new (ccxt as any).bybit(params);
  await ex.loadMarkets();
  return ex as Exchange;
}

export async function createBybitPerp(requireKeys: boolean): Promise<Exchange> {
  const apiKey = getEnv("BYBIT_API_KEY");
  const secret = getEnv("BYBIT_API_SECRET");
  if (requireKeys && !(apiKey && secret)) throw new Error("Missing Bybit API keys (BYBIT_API_KEY / BYBIT_API_SECRET).");

  const params: any = { enableRateLimit: true, timeout: 30000, options: { defaultType: "swap" } };
  if (apiKey && secret) params.apiKey = apiKey, params.secret = secret;
  const ex: any = new (ccxt as any).bybit(params);
  await ex.loadMarkets();
  return ex as Exchange;
}

export async function createHyperliquidSpot(requireKeys: boolean): Promise<Exchange> {
  const walletAddress = getEnv("HYPERLIQUID_WALLET_ADDRESS");
  const privateKey = getEnv("HYPERLIQUID_PRIVATE_KEY");
  if (requireKeys && !(walletAddress && privateKey)) {
    throw new Error("Missing Hyperliquid keys (HYPERLIQUID_WALLET_ADDRESS / HYPERLIQUID_PRIVATE_KEY).");
  }

  const params: any = { enableRateLimit: true, timeout: 30000, options: { defaultType: "spot" } };
  if (walletAddress && privateKey) {
    params.walletAddress = walletAddress;
    params.privateKey = privateKey;
  }
  const ex: any = new (ccxt as any).hyperliquid(params);
  await ex.loadMarkets();
  return ex as Exchange;
}

export async function createHyperliquidPerp(requireKeys: boolean): Promise<Exchange> {
  const walletAddress = getEnv("HYPERLIQUID_WALLET_ADDRESS");
  const privateKey = getEnv("HYPERLIQUID_PRIVATE_KEY");
  if (requireKeys && !(walletAddress && privateKey)) {
    throw new Error("Missing Hyperliquid keys (HYPERLIQUID_WALLET_ADDRESS / HYPERLIQUID_PRIVATE_KEY).");
  }

  const params: any = { enableRateLimit: true, timeout: 30000, options: { defaultType: "swap" } };
  if (walletAddress && privateKey) {
    params.walletAddress = walletAddress;
    params.privateKey = privateKey;
  }
  const ex: any = new (ccxt as any).hyperliquid(params);
  await ex.loadMarkets();
  return ex as Exchange;
}

export async function createOkxSpot(requireKeys: boolean): Promise<Exchange> {
  const apiKey = getEnv("OKX_API_KEY");
  const secret = getEnv("OKX_API_SECRET");
  const passphrase = getEnv("OKX_API_PASSPHRASE", "OKX_PASSPHRASE");
  if (requireKeys && !(apiKey && secret && passphrase)) {
    throw new Error("Missing OKX API keys (OKX_API_KEY / OKX_API_SECRET / OKX_API_PASSPHRASE).");
  }

  const params: any = { enableRateLimit: true, timeout: 30000, options: { defaultType: "spot" } };
  if (apiKey && secret && passphrase) {
    params.apiKey = apiKey;
    params.secret = secret;
    params.password = passphrase;
  }
  const ex: any = new (ccxt as any).okx(params);
  await ex.loadMarkets();
  return ex as Exchange;
}

export async function createOkxPerp(requireKeys: boolean): Promise<Exchange> {
  const apiKey = getEnv("OKX_API_KEY");
  const secret = getEnv("OKX_API_SECRET");
  const passphrase = getEnv("OKX_API_PASSPHRASE", "OKX_PASSPHRASE");
  if (requireKeys && !(apiKey && secret && passphrase)) {
    throw new Error("Missing OKX API keys (OKX_API_KEY / OKX_API_SECRET / OKX_API_PASSPHRASE).");
  }

  const params: any = { enableRateLimit: true, timeout: 30000, options: { defaultType: "swap" } };
  if (apiKey && secret && passphrase) {
    params.apiKey = apiKey;
    params.secret = secret;
    params.password = passphrase;
  }
  const ex: any = new (ccxt as any).okx(params);
  await ex.loadMarkets();
  return ex as Exchange;
}

// ========== DEX Exchanges ==========

export async function createDydxPerp(requireKeys: boolean): Promise<Exchange> {
  const apiKey = getEnv("DYDX_API_KEY");
  const secret = getEnv("DYDX_API_SECRET");
  const passphrase = getEnv("DYDX_API_PASSPHRASE");
  if (requireKeys && !(apiKey && secret && passphrase)) {
    throw new Error("Missing dYdX API keys (DYDX_API_KEY / DYDX_API_SECRET / DYDX_API_PASSPHRASE).");
  }

  const params: any = { enableRateLimit: true, timeout: 30000, options: { defaultType: "swap" } };
  if (apiKey && secret && passphrase) {
    params.apiKey = apiKey;
    params.secret = secret;
    params.password = passphrase;
  }
  const ex: any = new (ccxt as any).dydx(params);
  await ex.loadMarkets();
  return ex as Exchange;
}

export async function createParadexPerp(requireKeys: boolean): Promise<Exchange> {
  const apiKey = getEnv("PARADEX_API_KEY");
  const secret = getEnv("PARADEX_API_SECRET");
  if (requireKeys && !(apiKey && secret)) {
    throw new Error("Missing Paradex API keys (PARADEX_API_KEY / PARADEX_API_SECRET).");
  }

  const params: any = { enableRateLimit: true, timeout: 30000, options: { defaultType: "swap" } };
  if (apiKey && secret) {
    params.apiKey = apiKey;
    params.secret = secret;
  }
  const ex: any = new (ccxt as any).paradex(params);
  await ex.loadMarkets();
  return ex as Exchange;
}

// ========== Additional DEX Exchanges ==========

export async function createBackpackPerp(requireKeys: boolean): Promise<Exchange> {
  const apiKey = getEnv("BACKPACK_API_KEY");
  const secret = getEnv("BACKPACK_API_SECRET");
  if (requireKeys && !(apiKey && secret)) {
    throw new Error("Missing Backpack API keys (BACKPACK_API_KEY / BACKPACK_API_SECRET).");
  }

  const params: any = { enableRateLimit: true, timeout: 30000, options: { defaultType: "swap" } };
  if (apiKey && secret) {
    params.apiKey = apiKey;
    params.secret = secret;
  }
  const ex: any = new (ccxt as any).backpack(params);
  await ex.loadMarkets();
  return ex as Exchange;
}

export async function createApexPerp(requireKeys: boolean): Promise<Exchange> {
  const apiKey = getEnv("APEX_API_KEY");
  const secret = getEnv("APEX_API_SECRET");
  if (requireKeys && !(apiKey && secret)) {
    throw new Error("Missing Apex API keys (APEX_API_KEY / APEX_API_SECRET).");
  }

  const params: any = { enableRateLimit: true, timeout: 30000, options: { defaultType: "swap" } };
  if (apiKey && secret) {
    params.apiKey = apiKey;
    params.secret = secret;
  }
  const ex: any = new (ccxt as any).apex(params);
  await ex.loadMarkets();
  return ex as Exchange;
}

export async function createDefxPerp(requireKeys: boolean): Promise<Exchange> {
  const apiKey = getEnv("DEFX_API_KEY");
  const secret = getEnv("DEFX_API_SECRET");
  if (requireKeys && !(apiKey && secret)) {
    throw new Error("Missing Defx API keys (DEFX_API_KEY / DEFX_API_SECRET).");
  }

  const params: any = { enableRateLimit: true, timeout: 30000, options: { defaultType: "swap" } };
  if (apiKey && secret) {
    params.apiKey = apiKey;
    params.secret = secret;
  }
  const ex: any = new (ccxt as any).defx(params);
  await ex.loadMarkets();
  return ex as Exchange;
}

export async function createWoofiProPerp(requireKeys: boolean): Promise<Exchange> {
  const apiKey = getEnv("WOOFIPRO_API_KEY");
  const secret = getEnv("WOOFIPRO_API_SECRET");
  if (requireKeys && !(apiKey && secret)) {
    throw new Error("Missing WOOFi Pro API keys (WOOFIPRO_API_KEY / WOOFIPRO_API_SECRET).");
  }

  const params: any = { enableRateLimit: true, timeout: 30000, options: { defaultType: "swap" } };
  if (apiKey && secret) {
    params.apiKey = apiKey;
    params.secret = secret;
  }
  const ex: any = new (ccxt as any).woofipro(params);
  await ex.loadMarkets();
  return ex as Exchange;
}

export async function createModeTradePerp(requireKeys: boolean): Promise<Exchange> {
  const apiKey = getEnv("MODETRADE_API_KEY");
  const secret = getEnv("MODETRADE_API_SECRET");
  if (requireKeys && !(apiKey && secret)) {
    throw new Error("Missing ModeTrade API keys (MODETRADE_API_KEY / MODETRADE_API_SECRET).");
  }

  const params: any = { enableRateLimit: true, timeout: 30000, options: { defaultType: "swap" } };
  if (apiKey && secret) {
    params.apiKey = apiKey;
    params.secret = secret;
  }
  const ex: any = new (ccxt as any).modetrade(params);
  await ex.loadMarkets();
  return ex as Exchange;
}

export async function createHibachiPerp(requireKeys: boolean): Promise<Exchange> {
  const apiKey = getEnv("HIBACHI_API_KEY");
  const secret = getEnv("HIBACHI_API_SECRET");
  if (requireKeys && !(apiKey && secret)) {
    throw new Error("Missing Hibachi API keys (HIBACHI_API_KEY / HIBACHI_API_SECRET).");
  }

  const params: any = { enableRateLimit: true, timeout: 30000, options: { defaultType: "swap" } };
  if (apiKey && secret) {
    params.apiKey = apiKey;
    params.secret = secret;
  }
  const ex: any = new (ccxt as any).hibachi(params);
  await ex.loadMarkets();
  return ex as Exchange;
}

export async function createDeltaPerp(requireKeys: boolean): Promise<Exchange> {
  const apiKey = getEnv("DELTA_API_KEY");
  const secret = getEnv("DELTA_API_SECRET");
  if (requireKeys && !(apiKey && secret)) {
    throw new Error("Missing Delta API keys (DELTA_API_KEY / DELTA_API_SECRET).");
  }

  const params: any = { enableRateLimit: true, timeout: 30000, options: { defaultType: "swap" } };
  if (apiKey && secret) {
    params.apiKey = apiKey;
    params.secret = secret;
  }
  const ex: any = new (ccxt as any).delta(params);
  await ex.loadMarkets();
  return ex as Exchange;
}

// DEX exchange type for type safety
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

// CCXT-supported DEX perp exchanges
export const DEX_EXCHANGES_CCXT: DexExchange[] = [
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
];

// Custom REST API DEX exchanges (non-CCXT)
export const DEX_EXCHANGES_CUSTOM: DexExchange[] = [
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
];

// All DEX exchanges
export const DEX_EXCHANGES: DexExchange[] = [
  ...DEX_EXCHANGES_CCXT,
  ...DEX_EXCHANGES_CUSTOM,
];

export function isDexExchange(exchange: string): exchange is DexExchange {
  return DEX_EXCHANGES.includes(exchange as DexExchange);
}

export function isCcxtDexExchange(exchange: string): boolean {
  return DEX_EXCHANGES_CCXT.includes(exchange as DexExchange);
}

export function isCustomDexExchange(exchange: string): boolean {
  return DEX_EXCHANGES_CUSTOM.includes(exchange as DexExchange);
}
