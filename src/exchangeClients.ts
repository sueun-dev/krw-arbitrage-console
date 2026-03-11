import ccxt from "ccxt";
import type { Exchange } from "ccxt";
import {
  createBackpackPerp as createBackpackPerpCore,
  createBithumb as createBithumbCore,
  createBybitPerp as createBybitPerpCore,
  createBybitSpot as createBybitSpotCore,
  createDydxPerp as createDydxPerpCore,
  createGateioPerp as createGateioPerpCore,
  createGateioSpot as createGateioSpotCore,
  createHyperliquidPerp as createHyperliquidPerpCore,
  createHyperliquidSpot as createHyperliquidSpotCore,
  createOkxPerp as createOkxPerpCore,
  createOkxSpot as createOkxSpotCore,
  createParadexPerp as createParadexPerpCore,
  createUpbit as createUpbitCore,
  DEX_EXCHANGES_CCXT as CORE_DEX_EXCHANGES_CCXT,
  DEX_EXCHANGES_CUSTOM as CORE_DEX_EXCHANGES_CUSTOM,
  isCustomDexExchange as isCustomDexExchangeCore,
  type DexExchange as CoreDexExchange,
} from "./exchanges/exchange_clients";

type ExtraDexExchange = "apex" | "defx" | "woofipro" | "modetrade" | "hibachi" | "delta";

const DEFAULT_TIMEOUT_MS = 30000;
const EXTRA_DEX_EXCHANGES_CCXT: readonly ExtraDexExchange[] = [
  "apex",
  "defx",
  "woofipro",
  "modetrade",
  "hibachi",
  "delta",
] as const;

export type DexExchange = CoreDexExchange | ExtraDexExchange;

function getEnv(...names: string[]): string {
  for (const name of names) {
    const value = (process.env[name] ?? "").trim();
    if (value) {
      return value;
    }
  }
  return "";
}

function compatOptions(requireKeys: boolean, usePublicApi = false) {
  return { requireKeys, usePublicApi };
}

async function createCcxtPerpExchange(exchangeId: ExtraDexExchange, envPrefix: string, requireKeys: boolean): Promise<Exchange> {
  const apiKey = getEnv(`${envPrefix}_API_KEY`);
  const secret = getEnv(`${envPrefix}_API_SECRET`);

  if (requireKeys && !(apiKey && secret)) {
    throw new Error(`Missing ${envPrefix} API keys (${envPrefix}_API_KEY / ${envPrefix}_API_SECRET).`);
  }

  const params: Record<string, unknown> = {
    enableRateLimit: true,
    timeout: DEFAULT_TIMEOUT_MS,
    options: { defaultType: "swap" },
  };
  if (apiKey && secret) {
    params.apiKey = apiKey;
    params.secret = secret;
  }

  const ExchangeCtor = (ccxt as unknown as Record<string, new (params: Record<string, unknown>) => Exchange>)[exchangeId];
  if (!ExchangeCtor) {
    throw new Error(`Unsupported CCXT exchange: ${exchangeId}`);
  }

  const exchange = new ExchangeCtor(params);
  await exchange.loadMarkets();
  return exchange;
}

export async function createBithumb(requireKeys: boolean): Promise<Exchange> {
  return createBithumbCore({ requireKeys });
}

export async function createGateioSpot(requireKeys: boolean, usePublicApi: boolean): Promise<Exchange> {
  return createGateioSpotCore(compatOptions(requireKeys, usePublicApi));
}

export async function createGateioPerp(requireKeys: boolean, usePublicApi: boolean): Promise<Exchange> {
  return createGateioPerpCore(compatOptions(requireKeys, usePublicApi));
}

export async function createUpbit(requireKeys: boolean): Promise<Exchange> {
  return createUpbitCore({ requireKeys });
}

export async function createBybitSpot(requireKeys: boolean): Promise<Exchange> {
  return createBybitSpotCore({ requireKeys });
}

export async function createBybitPerp(requireKeys: boolean): Promise<Exchange> {
  return createBybitPerpCore({ requireKeys });
}

export async function createHyperliquidSpot(requireKeys: boolean): Promise<Exchange> {
  return createHyperliquidSpotCore({ requireKeys });
}

export async function createHyperliquidPerp(requireKeys: boolean): Promise<Exchange> {
  return createHyperliquidPerpCore({ requireKeys });
}

export async function createOkxSpot(requireKeys: boolean): Promise<Exchange> {
  return createOkxSpotCore({ requireKeys });
}

export async function createOkxPerp(requireKeys: boolean): Promise<Exchange> {
  return createOkxPerpCore({ requireKeys });
}

export async function createDydxPerp(requireKeys: boolean): Promise<Exchange> {
  return createDydxPerpCore({ requireKeys });
}

export async function createParadexPerp(requireKeys: boolean): Promise<Exchange> {
  return createParadexPerpCore({ requireKeys });
}

export async function createBackpackPerp(requireKeys: boolean): Promise<Exchange> {
  return createBackpackPerpCore({ requireKeys });
}

export async function createApexPerp(requireKeys: boolean): Promise<Exchange> {
  return createCcxtPerpExchange("apex", "APEX", requireKeys);
}

export async function createDefxPerp(requireKeys: boolean): Promise<Exchange> {
  return createCcxtPerpExchange("defx", "DEFX", requireKeys);
}

export async function createWoofiProPerp(requireKeys: boolean): Promise<Exchange> {
  return createCcxtPerpExchange("woofipro", "WOOFIPRO", requireKeys);
}

export async function createModeTradePerp(requireKeys: boolean): Promise<Exchange> {
  return createCcxtPerpExchange("modetrade", "MODETRADE", requireKeys);
}

export async function createHibachiPerp(requireKeys: boolean): Promise<Exchange> {
  return createCcxtPerpExchange("hibachi", "HIBACHI", requireKeys);
}

export async function createDeltaPerp(requireKeys: boolean): Promise<Exchange> {
  return createCcxtPerpExchange("delta", "DELTA", requireKeys);
}

export const DEX_EXCHANGES_CCXT: readonly DexExchange[] = [
  ...CORE_DEX_EXCHANGES_CCXT,
  ...EXTRA_DEX_EXCHANGES_CCXT,
] as const;

export const DEX_EXCHANGES_CUSTOM: readonly DexExchange[] = [...CORE_DEX_EXCHANGES_CUSTOM] as const;

export const DEX_EXCHANGES: readonly DexExchange[] = [
  ...DEX_EXCHANGES_CCXT,
  ...DEX_EXCHANGES_CUSTOM,
] as const;

export function isDexExchange(exchange: string): exchange is DexExchange {
  return DEX_EXCHANGES.includes(exchange as DexExchange);
}

export function isCcxtDexExchange(exchange: string): boolean {
  return DEX_EXCHANGES_CCXT.includes(exchange as DexExchange);
}

export function isCustomDexExchange(exchange: string): boolean {
  return isCustomDexExchangeCore(exchange);
}
