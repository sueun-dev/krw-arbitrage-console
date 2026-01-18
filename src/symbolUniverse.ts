import type { Exchange } from "ccxt";
import fs from "node:fs/promises";
import path from "node:path";
import { fetchJson } from "./http";

export type ArbitrageSymbolUniverse = {
  updatedAtTs: number;
  bithumbKrwSymbols: Record<string, string>;
  gateioSpotSymbols: Record<string, string>;
  gateioPerpSymbols: Record<string, string>;
  reverseCandidates: string[];
  kimchiCandidates: string[];
};

const RUNTIME_DIR_ENV = "OEH_RUNTIME_DIR";
const SYMBOL_CACHE_VERSION = 2;
const SYMBOL_CACHE_FILENAME = "arbitrage_symbols.json";
const DEFAULT_SYMBOL_CACHE_MAX_AGE_SECONDS = 60 * 60 * 24;

async function symbolCachePath(): Promise<string> {
  const runtimeDir = (process.env[RUNTIME_DIR_ENV] ?? "runtime").toString();
  const cacheDir = path.join(runtimeDir, "cache");
  await fs.mkdir(cacheDir, { recursive: true });
  return path.join(cacheDir, SYMBOL_CACHE_FILENAME);
}

export async function loadArbitrageSymbolUniverse(
  maxAgeSeconds = DEFAULT_SYMBOL_CACHE_MAX_AGE_SECONDS,
): Promise<ArbitrageSymbolUniverse | null> {
  const filePath = await symbolCachePath();
  let payload: any;
  try {
    payload = JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return null;
  }

  if (!payload || typeof payload !== "object") return null;
  if (payload.schema_version !== SYMBOL_CACHE_VERSION) return null;

  const updatedAtTs = Number(payload.updated_at_ts ?? 0);
  if (!Number.isFinite(updatedAtTs) || updatedAtTs <= 0) return null;
  if (maxAgeSeconds > 0 && (Date.now() / 1000 - updatedAtTs) > maxAgeSeconds) return null;

  const bithumb = payload.bithumb_krw_symbols;
  const spot = payload.gateio_spot_symbols;
  const perp = payload.gateio_perp_symbols;
  if (!bithumb || !spot || !perp) return null;

  const bithumbKrwSymbols = Object.fromEntries(Object.entries(bithumb).filter(([k, v]) => typeof k === "string" && typeof v === "string"));
  const gateioSpotSymbols = Object.fromEntries(Object.entries(spot).filter(([k, v]) => typeof k === "string" && typeof v === "string"));
  const gateioPerpSymbols = Object.fromEntries(Object.entries(perp).filter(([k, v]) => typeof k === "string" && typeof v === "string"));
  if (!Object.keys(bithumbKrwSymbols).length || !Object.keys(gateioSpotSymbols).length || !Object.keys(gateioPerpSymbols).length) return null;

  const reverseCandidatesRaw = Array.isArray(payload.reverse_candidates) ? payload.reverse_candidates.filter((x: any) => typeof x === "string") : null;
  const kimchiCandidatesRaw = Array.isArray(payload.kimchi_candidates) ? payload.kimchi_candidates.filter((x: any) => typeof x === "string") : null;

  const reverseCandidates = (
    reverseCandidatesRaw ?? Object.keys(bithumbKrwSymbols).filter((c: string) => c in gateioPerpSymbols)
  ).filter(
    (c: string) => c in bithumbKrwSymbols && c in gateioPerpSymbols,
  ).sort();

  const kimchiCandidates = (
    kimchiCandidatesRaw ??
    Object.keys(bithumbKrwSymbols).filter((c: string) => c in gateioPerpSymbols && c in gateioSpotSymbols)
  ).filter(
    (c: string) => c in bithumbKrwSymbols && c in gateioPerpSymbols && c in gateioSpotSymbols,
  ).sort();

  return {
    updatedAtTs,
    bithumbKrwSymbols: bithumbKrwSymbols as Record<string, string>,
    gateioSpotSymbols: gateioSpotSymbols as Record<string, string>,
    gateioPerpSymbols: gateioPerpSymbols as Record<string, string>,
    reverseCandidates,
    kimchiCandidates,
  };
}

async function saveArbitrageSymbolUniverse(universe: ArbitrageSymbolUniverse): Promise<string> {
  const filePath = await symbolCachePath();
  const tmpPath = `${filePath}.tmp`;
  const payload = {
    schema_version: SYMBOL_CACHE_VERSION,
    updated_at_ts: universe.updatedAtTs,
    bithumb_krw_symbols: universe.bithumbKrwSymbols,
    gateio_spot_symbols: universe.gateioSpotSymbols,
    gateio_perp_symbols: universe.gateioPerpSymbols,
    reverse_candidates: universe.reverseCandidates,
    kimchi_candidates: universe.kimchiCandidates,
  };
  await fs.writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await fs.rename(tmpPath, filePath);
  return filePath;
}

export async function krwSymbolsByBase(exchange: Exchange): Promise<Record<string, string>> {
  const symbols: Record<string, string> = {};
  const markets: any = (exchange as any).markets ?? {};
  for (const [symbol, market] of Object.entries<any>(markets)) {
    if (!market || market.active === false) continue;
    if (market.quote !== "KRW") continue;
    const base = market.base;
    if (!base || String(base).toUpperCase() === "KRW") continue;
    symbols[String(base).toUpperCase()] = symbol;
  }
  return symbols;
}

export async function bithumbKrwSymbolsRest(): Promise<Record<string, string>> {
  const symbols: Record<string, string> = {};
  const payload = await fetchJson<any>("https://api.bithumb.com/public/orderbook/ALL_KRW", { timeoutMs: 15000 });
  const data = payload?.data;
  if (!data || typeof data !== "object") return symbols;
  for (const [key, value] of Object.entries<any>(data)) {
    if (key === "timestamp" || key === "payment_currency") continue;
    if (!value || typeof value !== "object") continue;
    const base = String(key).toUpperCase();
    if (!base || base === "KRW") continue;
    symbols[base] = `${base}_KRW`;
  }
  return symbols;
}

export async function upbitKrwSymbolsRest(): Promise<Record<string, string>> {
  const symbols: Record<string, string> = {};
  const payload = await fetchJson<any[]>("https://api.upbit.com/v1/market/all?isDetails=false", { timeoutMs: 15000 });
  if (!Array.isArray(payload)) return symbols;
  for (const entry of payload) {
    const market = typeof entry?.market === "string" ? entry.market : "";
    if (!market.startsWith("KRW-")) continue;
    const base = market.split("-")[1];
    if (!base || base.toUpperCase() === "KRW") continue;
    symbols[base.toUpperCase()] = market;
  }
  return symbols;
}

export async function bithumbKrwSymbols(bithumb: Exchange): Promise<Record<string, string>> {
  return krwSymbolsByBase(bithumb);
}

export async function gateioSpotAndPerpSymbols(
  gateSpot: Exchange,
  gatePerp: Exchange,
): Promise<{ spot: Record<string, string>; perp: Record<string, string> }> {
  await gateSpot.loadMarkets();
  await gatePerp.loadMarkets();

  const spotSymbols: Record<string, string> = {};
  const spotMarkets: any = (gateSpot as any).markets ?? {};
  for (const [symbol, market] of Object.entries<any>(spotMarkets)) {
    if (!market || market.active === false) continue;
    if (market.spot === false) continue;
    if (market.quote !== "USDT") continue;
    const base = market.base;
    if (base) spotSymbols[String(base).toUpperCase()] = symbol;
  }

  const perpSymbols: Record<string, string> = {};
  const perpMarkets: any = (gatePerp as any).markets ?? {};
  for (const [symbol, market] of Object.entries<any>(perpMarkets)) {
    if (!market || market.active === false) continue;
    // We only want perpetual swaps for immediate hedging; delivery futures can trade at a big basis.
    if (!market.swap) continue;
    // Additional guards to avoid accidentally picking delivery contracts.
    if (market.future) continue;
    if (market.expiry || market.expiryDatetime) continue;
    if (/-\d{6}/.test(symbol)) continue; // e.g. BTC/USDT:USDT-260626
    if (!String(symbol).endsWith(":USDT")) continue; // GateIO linear USDT-settled perp
    if (market.quote !== "USDT") continue;
    const settle = market.settle;
    if (settle && String(settle).toUpperCase() !== "USDT") continue;
    const base = market.base;
    if (base) perpSymbols[String(base).toUpperCase()] = symbol;
  }

  return { spot: spotSymbols, perp: perpSymbols };
}

export async function bybitSpotAndPerpSymbols(
  spot: Exchange,
  perp: Exchange,
): Promise<{ spot: Record<string, string>; perp: Record<string, string> }> {
  await spot.loadMarkets();
  await perp.loadMarkets();

  const spotSymbols: Record<string, string> = {};
  const spotMarkets: any = (spot as any).markets ?? {};
  for (const [symbol, market] of Object.entries<any>(spotMarkets)) {
    if (!market || market.active === false) continue;
    if (market.spot === false) continue;
    if (market.quote !== "USDT") continue;
    const base = market.base;
    if (base) spotSymbols[String(base).toUpperCase()] = symbol;
  }

  const perpSymbols: Record<string, string> = {};
  const perpMarkets: any = (perp as any).markets ?? {};
  for (const [symbol, market] of Object.entries<any>(perpMarkets)) {
    if (!market || market.active === false) continue;
    if (!market.swap) continue;
    if (market.future) continue;
    if (market.quote !== "USDT") continue;
    const settle = market.settle;
    if (settle && String(settle).toUpperCase() !== "USDT") continue;
    const base = market.base;
    if (base) perpSymbols[String(base).toUpperCase()] = symbol;
  }

  return { spot: spotSymbols, perp: perpSymbols };
}

export async function okxSpotAndPerpSymbols(
  spot: Exchange,
  perp: Exchange,
): Promise<{ spot: Record<string, string>; perp: Record<string, string> }> {
  await spot.loadMarkets();
  await perp.loadMarkets();

  const spotSymbols: Record<string, string> = {};
  const spotMarkets: any = (spot as any).markets ?? {};
  for (const [symbol, market] of Object.entries<any>(spotMarkets)) {
    if (!market || market.active === false) continue;
    if (market.spot === false) continue;
    if (market.quote !== "USDT") continue;
    const base = market.base;
    if (base) spotSymbols[String(base).toUpperCase()] = symbol;
  }

  const perpSymbols: Record<string, string> = {};
  const perpMarkets: any = (perp as any).markets ?? {};
  for (const [symbol, market] of Object.entries<any>(perpMarkets)) {
    if (!market || market.active === false) continue;
    if (!market.swap) continue;
    if (market.future) continue;
    if (market.quote !== "USDT") continue;
    const settle = market.settle;
    if (settle && String(settle).toUpperCase() !== "USDT") continue;
    const base = market.base;
    if (base) perpSymbols[String(base).toUpperCase()] = symbol;
  }

  return { spot: spotSymbols, perp: perpSymbols };
}

export async function hyperliquidSpotAndPerpSymbols(
  spot: Exchange,
  perp: Exchange,
): Promise<{ spot: Record<string, string>; perp: Record<string, string> }> {
  await spot.loadMarkets();
  await perp.loadMarkets();

  const spotSymbols: Record<string, string> = {};
  const spotMarkets: any = (spot as any).markets ?? {};
  for (const [symbol, market] of Object.entries<any>(spotMarkets)) {
    if (!market || market.active === false) continue;
    if (market.spot === false) continue;
    if (market.quote !== "USDC") continue;
    const base = market.base;
    if (base) spotSymbols[String(base).toUpperCase()] = symbol;
  }

  const perpSymbols: Record<string, string> = {};
  const perpMarkets: any = (perp as any).markets ?? {};
  for (const [symbol, market] of Object.entries<any>(perpMarkets)) {
    if (!market || market.active === false) continue;
    if (!market.swap) continue;
    if (market.future) continue;
    if (market.quote !== "USDC") continue;
    const settle = market.settle;
    if (settle && String(settle).toUpperCase() !== "USDC") continue;
    const base = market.base;
    if (base) perpSymbols[String(base).toUpperCase()] = symbol;
  }

  return { spot: spotSymbols, perp: perpSymbols };
}

export async function lighterSpotAndPerpSymbols(): Promise<{ spot: Record<string, string>; perp: Record<string, string> }> {
  const spotSymbols: Record<string, string> = {};
  const perpSymbols: Record<string, string> = {};
  const payload = await fetchJson<any>("https://mainnet.zklighter.elliot.ai/api/v1/orderBooks", { timeoutMs: 15000 });
  const entries = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.order_books)
      ? payload.order_books
      : [];
  if (!entries.length) return { spot: spotSymbols, perp: perpSymbols };

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const status = typeof entry?.status === "string" ? entry.status.toLowerCase() : "";
    if (status && status !== "active") continue;
    const marketType = typeof entry?.market_type === "string" ? entry.market_type.toLowerCase() : "";
    const symbol = typeof entry?.symbol === "string" ? entry.symbol : "";
    const marketIdRaw = entry?.market_id ?? entry?.marketId ?? entry?.id;
    const marketId =
      typeof marketIdRaw === "string" || typeof marketIdRaw === "number" ? String(marketIdRaw) : "";
    if (!marketId) continue;

    if (marketType === "spot") {
      const [baseRaw, quoteRaw] = symbol.split("/");
      const base = baseRaw?.trim();
      const quote = quoteRaw?.trim().toUpperCase();
      if (!base || !quote) continue;
      if (quote !== "USDC" && quote !== "USDT") continue;
      spotSymbols[base.toUpperCase()] = marketId;
      continue;
    }

    if (marketType === "perp" || marketType === "perpetual" || marketType === "swap") {
      let base = symbol;
      if (symbol.includes("/")) base = symbol.split("/")[0] ?? symbol;
      else if (symbol.includes("-")) base = symbol.split("-")[0] ?? symbol;
      base = base.trim();
      if (!base) continue;
      perpSymbols[base.toUpperCase()] = marketId;
    }
  }

  return { spot: spotSymbols, perp: perpSymbols };
}

// ========== DEX Perp-Only Exchanges ==========

export async function dydxPerpSymbols(
  perp: Exchange,
): Promise<Record<string, string>> {
  await perp.loadMarkets();

  const perpSymbols: Record<string, string> = {};
  const perpMarkets: any = (perp as any).markets ?? {};
  for (const [symbol, market] of Object.entries<any>(perpMarkets)) {
    if (!market || market.active === false) continue;
    if (!market.swap) continue;
    if (market.future) continue;
    // dYdX uses USD as quote for perps
    if (market.quote !== "USD" && market.quote !== "USDC") continue;
    const base = market.base;
    if (base) perpSymbols[String(base).toUpperCase()] = symbol;
  }

  return perpSymbols;
}

export async function paradexPerpSymbols(
  perp: Exchange,
): Promise<Record<string, string>> {
  await perp.loadMarkets();

  const perpSymbols: Record<string, string> = {};
  const perpMarkets: any = (perp as any).markets ?? {};
  for (const [symbol, market] of Object.entries<any>(perpMarkets)) {
    if (!market || market.active === false) continue;
    if (!market.swap) continue;
    if (market.future) continue;
    // Paradex uses USD or USDC
    if (market.quote !== "USD" && market.quote !== "USDC") continue;
    const base = market.base;
    if (base) perpSymbols[String(base).toUpperCase()] = symbol;
  }

  return perpSymbols;
}

// Generic DEX perp symbols fetcher using CCXT
export async function getDexPerpSymbols(
  dex: string,
  perp: Exchange,
): Promise<Record<string, string>> {
  await perp.loadMarkets();

  const perpSymbols: Record<string, string> = {};
  const perpMarkets: any = (perp as any).markets ?? {};

  for (const [symbol, market] of Object.entries<any>(perpMarkets)) {
    if (!market || market.active === false) continue;
    if (!market.swap) continue;
    if (market.future) continue;
    // Skip delivery/dated contracts
    if (market.expiry || market.expiryDatetime) continue;
    if (/-\d{6}/.test(symbol)) continue;

    // Accept USD, USDC, USDT as quote currencies for perps
    const quote = String(market.quote ?? "").toUpperCase();
    if (quote !== "USD" && quote !== "USDC" && quote !== "USDT") continue;

    const base = market.base;
    if (base) perpSymbols[String(base).toUpperCase()] = symbol;
  }

  return perpSymbols;
}

// ========== Additional DEX Perp Symbol Fetchers ==========

export async function backpackPerpSymbols(perp: Exchange): Promise<Record<string, string>> {
  return getDexPerpSymbols("backpack", perp);
}

export async function apexPerpSymbols(perp: Exchange): Promise<Record<string, string>> {
  return getDexPerpSymbols("apex", perp);
}

export async function defxPerpSymbols(perp: Exchange): Promise<Record<string, string>> {
  return getDexPerpSymbols("defx", perp);
}

export async function woofiproPerpSymbols(perp: Exchange): Promise<Record<string, string>> {
  return getDexPerpSymbols("woofipro", perp);
}

export async function modetradePerpSymbols(perp: Exchange): Promise<Record<string, string>> {
  return getDexPerpSymbols("modetrade", perp);
}

export async function hibachiPerpSymbols(perp: Exchange): Promise<Record<string, string>> {
  return getDexPerpSymbols("hibachi", perp);
}

export async function deltaPerpSymbols(perp: Exchange): Promise<Record<string, string>> {
  return getDexPerpSymbols("delta", perp);
}

export async function refreshArbitrageSymbolUniverse(
  bithumb: Exchange,
  gateSpot: Exchange,
  gatePerp: Exchange,
): Promise<ArbitrageSymbolUniverse> {
  const bithumbSymbols = await bithumbKrwSymbols(bithumb);
  const { spot: gateioSpotSymbols, perp: gateioPerpSymbols } = await gateioSpotAndPerpSymbols(gateSpot, gatePerp);

  const reverseCandidates = Object.keys(bithumbSymbols).filter((c) => c in gateioPerpSymbols).sort();
  const kimchiCandidates = Object.keys(bithumbSymbols).filter((c) => c in gateioPerpSymbols && c in gateioSpotSymbols).sort();

  const universe: ArbitrageSymbolUniverse = {
    updatedAtTs: Math.trunc(Date.now() / 1000),
    bithumbKrwSymbols: bithumbSymbols,
    gateioSpotSymbols,
    gateioPerpSymbols,
    reverseCandidates,
    kimchiCandidates,
  };
  await saveArbitrageSymbolUniverse(universe);
  return universe;
}

export async function getArbitrageSymbolUniverse(
  bithumb: Exchange,
  gateSpot: Exchange,
  gatePerp: Exchange,
  options?: { maxAgeSeconds?: number; forceRefresh?: boolean },
): Promise<ArbitrageSymbolUniverse> {
  const maxAgeSeconds = options?.maxAgeSeconds ?? DEFAULT_SYMBOL_CACHE_MAX_AGE_SECONDS;
  const forceRefresh = options?.forceRefresh ?? false;

  if (!forceRefresh) {
    const cached = await loadArbitrageSymbolUniverse(maxAgeSeconds);
    if (cached) return cached;
  }
  return refreshArbitrageSymbolUniverse(bithumb, gateSpot, gatePerp);
}
