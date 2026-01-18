/**
 * Custom REST API implementations for DEX perpetual exchanges not supported by CCXT
 */

import { fetchJson } from "./http";

export type DexMarketInfo = {
  symbol: string;
  base: string;
  quote: string;
  bid: number;
  ask: number;
  lastPrice: number;
  fundingRate?: number;
};

export type DexApiResult = {
  exchange: string;
  markets: Record<string, DexMarketInfo>;
  timestamp: number;
};

// ========== Vertex Protocol (DEPRECATED - Shutdown August 14, 2025) ==========
// Vertex migrated to Ink L2 (Kraken's Layer 2). Old Arbitrum endpoints no longer work.
// See: https://blog.vertexprotocol.com/a-new-chapter-vertex-joins-the-ink-foundation/

export async function fetchVertexMarkets(): Promise<DexApiResult> {
  // Vertex Protocol shut down on August 14, 2025 and migrated to Ink L2
  return { exchange: "vertex", markets: {}, timestamp: Date.now() };
}

// ========== Drift Protocol (Solana) ==========
// Docs: https://docs.drift.trade/
// DLOB API: https://dlob.drift.trade/l2?marketName=SOL-PERP
// Prices are in 6 decimals

const DRIFT_DLOB_API = "https://dlob.drift.trade";

// Predefined list of Drift perp markets
const DRIFT_PERP_MARKETS = [
  "SOL-PERP", "BTC-PERP", "ETH-PERP", "APT-PERP", "ARB-PERP",
  "BONK-PERP", "DOGE-PERP", "INJ-PERP", "JTO-PERP", "JUP-PERP",
  "LINK-PERP", "MATIC-PERP", "RNDR-PERP", "SEI-PERP", "SUI-PERP",
  "TIA-PERP", "WIF-PERP", "PYTH-PERP", "W-PERP", "KMNO-PERP",
  "TNSR-PERP", "DRIFT-PERP", "POPCAT-PERP", "CLOUD-PERP", "IO-PERP",
  "ZEX-PERP", "MOTHER-PERP", "RENDER-PERP", "GRASS-PERP", "ME-PERP",
  "PENGU-PERP", "TRUMP-PERP", "MELANIA-PERP", "AI16Z-PERP", "FARTCOIN-PERP",
];

export async function fetchDriftMarkets(): Promise<DexApiResult> {
  const markets: Record<string, DexMarketInfo> = {};

  try {
    // Fetch L2 orderbook for each market in parallel
    const results = await Promise.all(
      DRIFT_PERP_MARKETS.map(async (marketName) => {
        try {
          const l2 = await fetchJson<{ bids?: Array<{ price: string }>; asks?: Array<{ price: string }> }>(
            `${DRIFT_DLOB_API}/l2?marketName=${marketName}&depth=1`,
            { timeoutMs: 5000 }
          );

          const bidRaw = l2?.bids?.[0]?.price;
          const askRaw = l2?.asks?.[0]?.price;

          if (!bidRaw && !askRaw) return null;

          // Prices are in 6 decimals
          const bid = bidRaw ? parseFloat(bidRaw) / 1e6 : 0;
          const ask = askRaw ? parseFloat(askRaw) / 1e6 : 0;

          if (bid <= 0 && ask <= 0) return null;

          const base = marketName.replace("-PERP", "").toUpperCase();
          return {
            base,
            symbol: marketName,
            bid,
            ask,
            lastPrice: (bid + ask) / 2 || bid || ask,
          };
        } catch {
          return null;
        }
      })
    );

    for (const result of results) {
      if (result && result.bid > 0 && result.ask > 0) {
        markets[result.base] = {
          symbol: result.symbol,
          base: result.base,
          quote: "USDC",
          bid: result.bid,
          ask: result.ask,
          lastPrice: result.lastPrice,
          fundingRate: 0,
        };
      }
    }
  } catch (err) {
    console.warn(`[Drift] Failed to fetch markets: ${err}`);
  }

  return { exchange: "drift", markets, timestamp: Date.now() };
}

// ========== GMX (Arbitrum/Avalanche) ==========
// Docs: https://docs.gmx.io/docs/api/rest-v2/

const GMX_ARBITRUM_API = "https://arbitrum-api.gmxinfra.io";

// GMX token decimals - use 8 as base for most tokens (results in divisor of 10^22)
// Specific overrides for tokens with known different precision
const GMX_TOKEN_PRECISION: Record<string, number> = {
  // Major tokens (divisor = 10^12 for ETH-like)
  ETH: 12, WETH: 12,
  // BTC uses 8 decimals (divisor = 10^22)
  BTC: 22, WBTC: 22, TBTC: 22,
  // Stablecoins
  USDC: 24, USDT: 24, DAI: 12,
  // Altcoins - estimate based on typical ranges
  LINK: 12, UNI: 12, ARB: 12, GMX: 12, AVAX: 12, MATIC: 12,
  OP: 12, AAVE: 12, WLD: 12, EIGEN: 12, PENDLE: 12, NEAR: 12,
  APE: 11, APT: 11, TAO: 6, MEW: 4, BOME: 9,
  // Small cap tokens
  DOGE: 22, SOL: 12, PEPE: 12, WIF: 12, BONK: 25, ORDI: 12, STX: 12,
  ATOM: 12, XRP: 12, LTC: 22, SHIB: 12, FLOKI: 21, MEME: 12, DYDX: 11,
};

function gmxPriceDivisor(symbol: string): number {
  const precision = GMX_TOKEN_PRECISION[symbol.toUpperCase()];
  if (precision !== undefined) return Math.pow(10, precision);
  // Default: assume mid-cap token with ~$1-100 price, use 10^12
  return 1e12;
}

export async function fetchGmxMarkets(): Promise<DexApiResult> {
  const markets: Record<string, DexMarketInfo> = {};

  try {
    // Fetch tickers
    const tickersRes = await fetchJson<any>(`${GMX_ARBITRUM_API}/prices/tickers`, {
      timeoutMs: 15000,
    });

    if (Array.isArray(tickersRes)) {
      for (const ticker of tickersRes) {
        let tokenSymbol = (ticker?.tokenSymbol || "").toUpperCase();
        if (!tokenSymbol || tokenSymbol.includes("DEPRECATED")) continue;

        const rawMin = parseFloat(ticker?.minPrice || "0");
        const rawMax = parseFloat(ticker?.maxPrice || "0");
        if (rawMin <= 0 || rawMax <= 0) continue;

        // Use dynamic divisor based on token
        const divisor = gmxPriceDivisor(tokenSymbol);
        const minPrice = rawMin / divisor;
        const maxPrice = rawMax / divisor;

        // Clean up symbol (remove _deprecated suffix)
        tokenSymbol = tokenSymbol.replace(/_DEPRECATED$/i, "");

        markets[tokenSymbol] = {
          symbol: `${tokenSymbol}/USD`,
          base: tokenSymbol,
          quote: "USD",
          bid: minPrice,
          ask: maxPrice,
          lastPrice: (minPrice + maxPrice) / 2,
        };
      }
    }
  } catch (err) {
    console.warn(`[GMX] Failed to fetch markets: ${err}`);
  }

  return { exchange: "gmx", markets, timestamp: Date.now() };
}

// ========== Jupiter Perps (Solana) ==========
// NOTE: Jupiter Perps API is still "work in progress" per their docs
// https://dev.jup.ag/docs/perps - "The Perps API is still a work in progress, stay tuned!"
// Currently only SDK/IDL parsing is available, no REST API

export async function fetchJupiterMarkets(): Promise<DexApiResult> {
  // Jupiter Perps REST API is not yet available
  // Users need to use Anchor IDL parsing via SDK
  console.warn("[Jupiter] Perps REST API not available yet - API is work in progress");
  return { exchange: "jupiter", markets: {}, timestamp: Date.now() };
}

// ========== EdgeX (NOT AVAILABLE - No public REST API) ==========
// Docs: https://edgex-1.gitbook.io/edgeX-documentation/api
// NOTE: EdgeX requires WebSocket (wss://quote.edgex.exchange) for market data.
// All REST API endpoints return 404. Only authenticated private endpoints are available.

export async function fetchEdgexMarkets(): Promise<DexApiResult> {
  // EdgeX does not provide public REST API for market data
  // Only WebSocket streaming is available at wss://quote.edgex.exchange
  return { exchange: "edgex", markets: {}, timestamp: Date.now() };
}

// ========== GRVT (Gravity Markets) ==========
// Docs: https://api-docs.grvt.io/market_data_api/
// Market Data API: https://market-data.grvt.io
// NOTE: GRVT uses POST requests for all endpoints

const GRVT_MARKET_DATA_API = "https://market-data.grvt.io";

export async function fetchGrvtMarkets(): Promise<DexApiResult> {
  const markets: Record<string, DexMarketInfo> = {};

  try {
    // Fetch all instruments using POST
    const instrumentsRes = await fetchJson<any>(`${GRVT_MARKET_DATA_API}/full/v1/all_instruments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
      timeoutMs: 15000,
    });

    if (instrumentsRes?.result && Array.isArray(instrumentsRes.result)) {
      // Get list of perpetual instruments
      const perpInstruments = instrumentsRes.result.filter(
        (inst: any) => inst?.kind === "PERPETUAL"
      );

      // Fetch ticker for each instrument (batch would be better but API requires individual calls)
      for (const inst of perpInstruments.slice(0, 20)) {
        // Limit to 20 for performance
        const base = (inst?.base || "").toUpperCase();
        if (!base) continue;

        try {
          const tickerRes = await fetchJson<any>(`${GRVT_MARKET_DATA_API}/full/v1/ticker`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ instrument: inst.instrument }),
            timeoutMs: 5000,
          });

          const ticker = tickerRes?.result || {};
          markets[base] = {
            symbol: inst.instrument,
            base,
            quote: inst?.quote || "USDT",
            bid: parseFloat(ticker?.best_bid_price || "0"),
            ask: parseFloat(ticker?.best_ask_price || "0"),
            lastPrice: parseFloat(ticker?.last_price || ticker?.mark_price || "0"),
            fundingRate: parseFloat(ticker?.funding_rate || ticker?.funding_rate_8h_curr || "0"),
          };
        } catch {
          // Skip this instrument if ticker fetch fails
          markets[base] = {
            symbol: inst.instrument,
            base,
            quote: inst?.quote || "USDT",
            bid: 0,
            ask: 0,
            lastPrice: 0,
            fundingRate: 0,
          };
        }
      }
    }
  } catch (err) {
    console.warn(`[GRVT] Failed to fetch markets: ${err}`);
  }

  return { exchange: "grvt", markets, timestamp: Date.now() };
}

// ========== Reya Network ==========
// Docs: https://docs.reya.xyz/technical-docs/reya-dex-rest-api-v2
// Market definitions: https://api.reya.xyz/v2/marketDefinitions
// Prices: https://api.reya.xyz/api/trading/prices (18 decimals)

const REYA_API = "https://api.reya.xyz";

export async function fetchReyaMarkets(): Promise<DexApiResult> {
  const markets: Record<string, DexMarketInfo> = {};

  try {
    // Fetch prices first (includes all markets)
    const pricesRes = await fetchJson<Record<string, any>>(`${REYA_API}/api/trading/prices`, {
      timeoutMs: 15000,
    });

    if (pricesRes && typeof pricesRes === "object") {
      for (const [marketKey, priceData] of Object.entries(pricesRes)) {
        // Key format: "BTCUSDMARK" -> base = "BTC"
        const base = marketKey.replace(/USDMARK$/i, "").toUpperCase();
        if (!base || base.length < 1) continue;

        // Prices are in 18 decimal format
        const oraclePrice = parseFloat(priceData?.oraclePrice || "0") / 1e18;
        const poolPrice = parseFloat(priceData?.poolPrice || "0") / 1e18;
        const price = parseFloat(priceData?.price || "0") / 1e18;

        const lastPrice = price || oraclePrice || poolPrice;
        if (lastPrice > 0) {
          markets[base] = {
            symbol: `${base}RUSDPERP`,
            base,
            quote: "USD",
            bid: lastPrice * 0.9995,  // Estimated spread
            ask: lastPrice * 1.0005,
            lastPrice,
            fundingRate: 0, // Would need separate endpoint
          };
        }
      }
    }
  } catch (err) {
    console.warn(`[Reya] Failed to fetch markets: ${err}`);
  }

  return { exchange: "reya", markets, timestamp: Date.now() };
}

// ========== Nado (Ink L2 - TESTNET ONLY) ==========
// Docs: https://docs.nado.xyz/developer-resources/api/v2
// NOTE: Nado mainnet not yet available. Using testnet data.
// Testnet: https://archive.test.nado.xyz/v2/tickers

const NADO_TESTNET_API = "https://archive.test.nado.xyz/v2";

export async function fetchNadoMarkets(): Promise<DexApiResult> {
  const markets: Record<string, DexMarketInfo> = {};

  try {
    // Using testnet - mainnet not available yet
    const tickersRes = await fetchJson<Record<string, any>>(`${NADO_TESTNET_API}/tickers`, {
      timeoutMs: 15000,
    });

    // Response is an object with ticker keys like "BTC-PERP_USDT0"
    if (tickersRes && typeof tickersRes === "object") {
      for (const [tickerId, ticker] of Object.entries(tickersRes)) {
        // Only get perp markets (ticker_id contains "-PERP")
        if (!tickerId.includes("-PERP")) continue;

        // Extract base from ticker_id (e.g., "BTC-PERP_USDT0" -> "BTC")
        const basePart = tickerId.split("-PERP")[0];
        if (!basePart) continue;
        const base = basePart.toUpperCase();
        if (!base) continue;

        const lastPrice = parseFloat(ticker?.last_price || "0");
        if (lastPrice <= 0) continue;

        markets[base] = {
          symbol: tickerId,
          base,
          quote: "USDT",
          bid: lastPrice * 0.9995,
          ask: lastPrice * 1.0005,
          lastPrice,
          fundingRate: 0,
        };
      }
    }
  } catch (err) {
    console.warn(`[Nado] Failed to fetch markets: ${err}`);
  }

  return { exchange: "nado", markets, timestamp: Date.now() };
}

// ========== Ostium (RWA Perpetuals) ==========
// Docs: https://ostium-labs.gitbook.io/ostium-docs/developer/api-and-sdk

const OSTIUM_API = "https://metadata-backend.ostium.io";

export async function fetchOstiumMarkets(): Promise<DexApiResult> {
  const markets: Record<string, DexMarketInfo> = {};

  try {
    // Fetch all latest prices
    const pricesRes = await fetchJson<any>(`${OSTIUM_API}/PricePublish/latest-prices`, {
      timeoutMs: 15000,
    });

    if (Array.isArray(pricesRes)) {
      for (const item of pricesRes) {
        const from = (item?.from || "").toUpperCase();
        const to = (item?.to || "").toUpperCase();
        if (!from || !to) continue;

        // Create symbol like EUR/USD, GBP/USD, XAU/USD
        const symbol = `${from}/${to}`;
        const bid = parseFloat(item?.bid || "0");
        const ask = parseFloat(item?.ask || "0");
        const mid = parseFloat(item?.mid || "0");

        if (mid > 0) {
          markets[from] = {
            symbol,
            base: from,
            quote: to,
            bid: bid || mid * 0.999,
            ask: ask || mid * 1.001,
            lastPrice: mid,
          };
        }
      }
    }
  } catch (err) {
    console.warn(`[Ostium] Failed to fetch markets: ${err}`);
  }

  return { exchange: "ostium", markets, timestamp: Date.now() };
}

// ========== Extended (Starknet) ==========
// Docs: https://api.docs.extended.exchange/

// Verified endpoint: https://api.starknet.extended.exchange/api/v1/info/markets
const EXTENDED_API = "https://api.starknet.extended.exchange/api/v1";

export async function fetchExtendedMarkets(): Promise<DexApiResult> {
  const markets: Record<string, DexMarketInfo> = {};

  try {
    // Fetch all markets with stats - verified working endpoint
    const marketsRes = await fetchJson<any>(`${EXTENDED_API}/info/markets`, {
      timeoutMs: 15000,
    });

    if (marketsRes?.status === "OK" && Array.isArray(marketsRes.data)) {
      for (const market of marketsRes.data) {
        // Market name format: "ENA-USD", "BTC-USD"
        const name = market?.name || "";
        const base = (market?.assetName || name.split("-")[0] || "").toUpperCase();
        if (!base) continue;

        const stats = market?.marketStats || {};
        const bid = parseFloat(stats?.bidPrice || "0");
        const ask = parseFloat(stats?.askPrice || "0");
        const lastPrice = parseFloat(stats?.lastPrice || "0");
        const markPrice = parseFloat(stats?.markPrice || "0");
        const fundingRate = parseFloat(stats?.fundingRate || "0");

        if (lastPrice > 0 || markPrice > 0) {
          markets[base] = {
            symbol: name,
            base,
            quote: "USD",
            bid: bid || (lastPrice || markPrice) * 0.999,
            ask: ask || (lastPrice || markPrice) * 1.001,
            lastPrice: lastPrice || markPrice,
            fundingRate,
          };
        }
      }
    }
  } catch (err) {
    console.warn(`[Extended] Failed to fetch markets: ${err}`);
  }

  return { exchange: "extended", markets, timestamp: Date.now() };
}

// ========== Pacifica (Solana) ==========
// Docs: https://docs.pacifica.fi/api-documentation/api/rest-api
// Verified endpoint: https://api.pacifica.fi/api/v1/info/prices

const PACIFICA_API = "https://api.pacifica.fi/api/v1";

export async function fetchPacificaMarkets(): Promise<DexApiResult> {
  const markets: Record<string, DexMarketInfo> = {};

  try {
    // Fetch prices - verified working endpoint
    const pricesRes = await fetchJson<any>(`${PACIFICA_API}/info/prices`, {
      timeoutMs: 15000,
    });

    if (pricesRes?.success && Array.isArray(pricesRes.data)) {
      for (const item of pricesRes.data) {
        const base = (item?.symbol || "").toUpperCase();
        if (!base) continue;

        const mid = parseFloat(item?.mid || "0");
        const mark = parseFloat(item?.mark || "0");
        const oracle = parseFloat(item?.oracle || "0");
        const funding = parseFloat(item?.funding || "0");
        const nextFunding = parseFloat(item?.next_funding || "0");

        const lastPrice = mark || mid || oracle;
        if (lastPrice > 0) {
          markets[base] = {
            symbol: `${base}-PERP`,
            base,
            quote: "USD",
            bid: mid * 0.999 || lastPrice * 0.999,
            ask: mid * 1.001 || lastPrice * 1.001,
            lastPrice,
            fundingRate: funding || nextFunding,
          };
        }
      }
    }
  } catch (err) {
    console.warn(`[Pacifica] Failed to fetch markets: ${err}`);
  }

  return { exchange: "pacifica", markets, timestamp: Date.now() };
}

// ========== Varational (Arbitrum) ==========
// NOTE: No public API documentation found for Varational.
// The exchange may be in early development or private beta.
// Attempted endpoint patterns return no data.

export async function fetchVarationalMarkets(): Promise<DexApiResult> {
  // No public API documentation available for Varational
  console.warn("[Varational] No public API documentation found");
  return { exchange: "varational", markets: {}, timestamp: Date.now() };
}

// ========== Unified Fetch Function ==========

export type CustomDexName =
  | "vertex"
  | "drift"
  | "gmx"
  | "jupiter"
  | "edgex"
  | "grvt"
  | "reya"
  | "nado"
  | "ostium"
  | "extended"
  | "pacifica"
  | "varational";

export const CUSTOM_DEX_LIST: CustomDexName[] = [
  "vertex",
  "drift",
  // "gmx", // Removed due to symbol collision issues (APT, BOME, MEW have wrong prices)
  "jupiter",
  "edgex",
  "grvt",
  "reya",
  "nado",
  "ostium",
  "extended",
  "pacifica",
  "varational",
];

const DEX_FETCHERS: Record<CustomDexName, () => Promise<DexApiResult>> = {
  vertex: fetchVertexMarkets,
  drift: fetchDriftMarkets,
  gmx: fetchGmxMarkets,
  jupiter: fetchJupiterMarkets,
  edgex: fetchEdgexMarkets,
  grvt: fetchGrvtMarkets,
  reya: fetchReyaMarkets,
  nado: fetchNadoMarkets,
  ostium: fetchOstiumMarkets,
  extended: fetchExtendedMarkets,
  pacifica: fetchPacificaMarkets,
  varational: fetchVarationalMarkets,
};

export async function fetchCustomDexMarkets(dex: CustomDexName): Promise<DexApiResult> {
  const fetcher = DEX_FETCHERS[dex];
  if (!fetcher) {
    return { exchange: dex, markets: {}, timestamp: Date.now() };
  }
  return fetcher();
}

export async function fetchAllCustomDexMarkets(): Promise<Record<CustomDexName, DexApiResult>> {
  const results: Record<string, DexApiResult> = {};

  await Promise.all(
    CUSTOM_DEX_LIST.map(async (dex) => {
      try {
        results[dex] = await fetchCustomDexMarkets(dex);
      } catch (err) {
        console.warn(`[${dex}] Fetch failed: ${err}`);
        results[dex] = { exchange: dex, markets: {}, timestamp: Date.now() };
      }
    })
  );

  return results as Record<CustomDexName, DexApiResult>;
}
