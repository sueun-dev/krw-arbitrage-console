import { bithumbSpotBalance, gateioSpotBalance } from "./balances";
import { applyFee, basisPct, premiumPct } from "./calculations";
import { commonChainPairs } from "./chains";
import {
  createBithumb,
  createBybitPerp,
  createBybitSpot,
  createGateioPerp,
  createGateioSpot,
  createHyperliquidPerp,
  createHyperliquidSpot,
  createOkxPerp,
  createOkxSpot,
} from "./exchangeClients";
import {
  BITHUMB_SPOT_TAKER_FEE,
  BYBIT_PERP_TAKER_FEE,
  BYBIT_SPOT_TAKER_FEE,
  GATEIO_PERP_TAKER_FEE,
  GATEIO_SPOT_TAKER_FEE,
  HYPERLIQUID_PERP_TAKER_FEE,
  HYPERLIQUID_SPOT_TAKER_FEE,
  LIGHTER_PERP_TAKER_FEE,
  LIGHTER_SPOT_TAKER_FEE,
  OKX_PERP_TAKER_FEE,
  OKX_SPOT_TAKER_FEE,
  UPBIT_SPOT_TAKER_FEE,
} from "./fees";
import { fetchJson } from "./http";
import {
  feeAdjustedQuote,
  fetchOrderbook,
  fetchQuote,
  fetchQuotesByBase,
  fetchVwapQuote,
  fetchVwapQuotesByBase,
  quoteAndSizeFromNotional,
} from "./marketData";
import { MarketQuote } from "./models";
import { analyzeBuyFillFromQuote, analyzeSellFillFromBase } from "./orderbook";
import { gateioPerpShortQty } from "./positions";
import { usdtKrwRateContext, usdtKrwRateSource } from "./rates";
import { computeKimchiOpportunities, computeNearZeroOpportunities } from "./scanner";
import { selectTransferableCandidateCoin } from "./selection";
import {
  bybitSpotAndPerpSymbols,
  bithumbKrwSymbolsRest,
  gateioSpotAndPerpSymbols,
  getArbitrageSymbolUniverse,
  hyperliquidSpotAndPerpSymbols,
  lighterSpotAndPerpSymbols,
  okxSpotAndPerpSymbols,
  upbitKrwSymbolsRest,
} from "./symbolUniverse";
import { buildTransferEtaEntries } from "./transferEta";
import {
  bithumbInoutStatuses,
  bybitCurrencyStatuses,
  gateioCurrencyStatuses,
  okxCurrencyStatuses,
  upbitInoutStatuses,
} from "./transfers";
import { bithumbMarketBuyBase, bithumbMarketSellBase, gateioPerpCover, gateioPerpShort, gateioSpotBuy, gateioSpotSell } from "./trading";
import {
  BithumbOrderbookWs,
  BybitPerpOrderbookWs,
  BybitSpotOrderbookWs,
  GateioFuturesBookTickerWs,
  GateioSpotTickerWs,
  HyperliquidPerpOrderbookWs,
  HyperliquidSpotOrderbookWs,
  LighterPerpOrderbookWs,
  LighterSpotOrderbookWs,
  OkxPerpTickerWs,
  OkxSpotTickerWs,
  UpbitOrderbookWs,
} from "./wsQuotes";

const DEFAULT_ORDERBOOK_DEPTH = 20;
const DEFAULT_SCAN_LIMIT = 30;
const DEFAULT_SCAN_CONCURRENCY = 12;
const DEFAULT_WATCH_INTERVAL_SEC = 1;
const DEFAULT_WATCH_NOTIONAL_KRW = 5_000_000;
const DEFAULT_SYMBOL_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_B2G_BASIS_MAX_PCT = 0.2;
const DEFAULT_G2B_BASIS_MAX_PCT = 0.2;
const DEFAULT_CYCLE_LEG_LIMIT = 50;

type WatchSymbolMaps = {
  updatedAt: number;
  domesticSymbols: Record<string, string>;
  gateioSpotSymbols: Record<string, string>;
  gateioPerpSymbols: Record<string, string>;
};

const watchSymbolCache = new Map<string, WatchSymbolMaps>();

export type ConfirmFunc = () => Promise<boolean> | boolean;
export type TransferConfirmFunc = (coin: string, direction: string) => Promise<boolean> | boolean;

function sortReversePreferred(a: { premiumPct: number }, b: { premiumPct: number }): number {
  const aPos = a.premiumPct > 0;
  const bPos = b.premiumPct > 0;
  if (aPos !== bPos) return aPos ? 1 : -1; // negatives first
  const absDiff = Math.abs(a.premiumPct) - Math.abs(b.premiumPct); // closer to 0 first
  if (absDiff !== 0) return absDiff;
  return a.premiumPct - b.premiumPct; // stable tie-breaker (more negative first)
}

function sortPremiumAsc(a: { premiumPct: number; coin?: string }, b: { premiumPct: number; coin?: string }): number {
  const diff = a.premiumPct - b.premiumPct;
  if (diff !== 0) return diff;
  const aCoin = typeof a.coin === "string" ? a.coin : "";
  const bCoin = typeof b.coin === "string" ? b.coin : "";
  return aCoin.localeCompare(bCoin);
}

function sortPremiumDesc(a: { premiumPct: number; coin?: string }, b: { premiumPct: number; coin?: string }): number {
  const diff = b.premiumPct - a.premiumPct;
  if (diff !== 0) return diff;
  const aCoin = typeof a.coin === "string" ? a.coin : "";
  const bCoin = typeof b.coin === "string" ? b.coin : "";
  return aCoin.localeCompare(bCoin);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sleepWithSignal(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) return sleep(ms);
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function formatKrw(value: number): string {
  return `₩${Math.round(value).toLocaleString()}`;
}

function formatUsdtPrice(price: number): string {
  if (!Number.isFinite(price) || price <= 0) return "N/A";
  if (price >= 1000) return `${price.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT`;
  if (price >= 1) return `${price.toLocaleString(undefined, { maximumFractionDigits: 6 })} USDT`;
  return `${price.toLocaleString(undefined, { maximumFractionDigits: 10 })} USDT`;
}

function formatUsdtAmount(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return "N/A";
  if (amount >= 1000) return `${Math.round(amount).toLocaleString()} USDT`;
  return `${amount.toLocaleString(undefined, { maximumFractionDigits: 6 })} USDT`;
}

function formatCoinAmount(amount: number, coin: string): string {
  if (!Number.isFinite(amount) || amount <= 0) return "N/A";
  if (amount >= 1) return `${amount.toLocaleString(undefined, { maximumFractionDigits: 8 })} ${coin}`;
  return `${amount.toLocaleString(undefined, { maximumFractionDigits: 12 })} ${coin}`;
}

export type WatchTransferChain = {
  senderChain: string;
  receiverChain: string;
  feeCoin: number | null;
  feeKrw: number | null;
  minCoin: number | null;
  minKrw: number | null;
};

export type WatchTransfer = {
  direction: "b2g" | "g2b";
  chains: WatchTransferChain[];
  closedReason?: string; // 닫힌 이유: "빗썸 출금 중단", "게이트 입금 중단", "공통 체인 없음" 등
};

export type WatchReverseRow = {
  rank: number;
  direction?: "b2g" | "g2b";
  cycle?: boolean;
  coin: string;
  outCoin?: string;
  backCoin?: string;
  domesticExchange?: "bithumb" | "upbit";
  overseasExchange?: OverseasExchange;
  missing?: boolean;
  premiumPct?: number;
  edgeKrw?: number;
  edgePct?: number;
  netEdgeKrw?: number;
  netEdgePct?: number;
  transferOk?: boolean;
  outTransferOk?: boolean;
  backTransferOk?: boolean;
  outTransferClosedReason?: string;
  backTransferClosedReason?: string;
  domesticAsk?: number;
  domesticBid?: number;
  overseasBid?: number;
  gapSource?: "spot" | "perp";
  gateioSpotAsk?: number;
  gateioSpotBid?: number;
  gateioSpotSellUsdt?: number;
  spotVsPerpPct?: number;
  outDomesticAsk?: number;
  outOverseasBid?: number;
  backOverseasAsk?: number;
  backDomesticBid?: number;
  outSpotVsPerpPct?: number;
  backSpotVsPerpPct?: number;
  impact?: {
    domestic?: number;
    gateioSpot?: number;
    gateioPerp?: number;
  };
  transfer?: WatchTransfer;
  transferOut?: WatchTransfer;
  transferBack?: WatchTransfer;
  transferText?: string;
};

export type OverseasExchange = "gateio" | "bybit" | "okx" | "hyperliquid" | "lighter";

export type SharedOverseasResources = {
  exchange: OverseasExchange;
  spot?: any;
  perp?: any;
  spotWs?: GateioSpotTickerWs | BybitSpotOrderbookWs | OkxSpotTickerWs | HyperliquidSpotOrderbookWs | LighterSpotOrderbookWs;
  perpWs?: GateioFuturesBookTickerWs | BybitPerpOrderbookWs | OkxPerpTickerWs | HyperliquidPerpOrderbookWs | LighterPerpOrderbookWs;
};

export type SharedDomesticResources = {
  exchange: "bithumb" | "upbit";
  ws: BithumbOrderbookWs | UpbitOrderbookWs;
  symbols: string[];
};

export type WatchReverseTick = {
  tick: number;
  time: string;
  mode?: "auto" | "pair";
  rate: {
    label: string;
    usdtKrw: number;
    usdtPremiumPct?: number | null;
    premiumSource?: string | null;
    fxUsdKrw?: number | null;
    domesticUsdtKrw?: number | null;
  };
  config: {
    topN: number;
    displayTopK: number;
    displayFarK: number;
    intervalSec: number;
    concurrency: number;
    notionalKrw: number;
    fullUniverse?: boolean;
    domesticExchange?: "bithumb" | "upbit";
    overseasExchange?: OverseasExchange;
  };
  watchCoins: string[];
  closeCoins: string[];
  farCoins: string[];
  rows: WatchReverseRow[];
  allRows?: WatchReverseRow[];
};

export type WatchStatus = {
  phase: "init" | "transfer" | "tick" | "error" | "stopped";
  message: string;
  done?: number;
  total?: number;
};

async function asyncPool<TItem, TResult>(
  concurrency: number,
  items: TItem[],
  worker: (item: TItem, index: number) => Promise<TResult>,
): Promise<TResult[]> {
  const limit = Math.max(1, Math.trunc(concurrency));
  const results: TResult[] = new Array(items.length);
  let nextIndex = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= items.length) return;
      const item = items[current];
      if (item === undefined) return;
      results[current] = await worker(item, current);
    }
  });

  await Promise.all(runners);
  return results;
}

function chunkArray<T>(values: T[], size: number): T[][] {
  if (size <= 0) return [values];
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

async function getWatchSymbolMaps(
  domesticExchange: "bithumb" | "upbit",
  overseasExchange: OverseasExchange,
  gateSpot: any,
  gatePerp: any,
): Promise<WatchSymbolMaps> {
  const cacheKey = `${domesticExchange}:${overseasExchange}`;
  const cached = watchSymbolCache.get(cacheKey);
  if (cached && Date.now() - cached.updatedAt < DEFAULT_SYMBOL_CACHE_TTL_MS) return cached;

  const [domesticSymbols, gateioSymbols] = await Promise.all([
    domesticExchange === "upbit" ? upbitKrwSymbolsRest() : bithumbKrwSymbolsRest(),
    overseasExchange === "bybit"
      ? bybitSpotAndPerpSymbols(gateSpot, gatePerp)
      : overseasExchange === "okx"
        ? okxSpotAndPerpSymbols(gateSpot, gatePerp)
        : overseasExchange === "hyperliquid"
          ? hyperliquidSpotAndPerpSymbols(gateSpot, gatePerp)
          : overseasExchange === "lighter"
            ? lighterSpotAndPerpSymbols()
          : gateioSpotAndPerpSymbols(gateSpot, gatePerp),
  ]);
  const entry: WatchSymbolMaps = {
    updatedAt: Date.now(),
    domesticSymbols,
    gateioSpotSymbols: gateioSymbols.spot,
    gateioPerpSymbols: gateioSymbols.perp,
  };
  watchSymbolCache.set(cacheKey, entry);
  return entry;
}

async function fetchUpbitOrderbookQuotes(exchange: any, symbols: string[]): Promise<Record<string, MarketQuote>> {
  const out: Record<string, MarketQuote> = {};
  const idToSymbol = new Map<string, string>();
  for (const symbol of symbols) {
    if (symbol.startsWith("KRW-")) {
      idToSymbol.set(symbol, symbol);
      continue;
    }
    const market = exchange?.market?.(symbol) ?? exchange?.markets?.[symbol];
    const id = typeof market?.id === "string" ? market.id : "";
    if (id) idToSymbol.set(id, symbol);
  }
  if (!idToSymbol.size) return out;

  const ids = [...idToSymbol.keys()];
  for (const batch of chunkArray(ids, 90)) {
    try {
      const payload = await fetchJson<any[]>(
        `https://api.upbit.com/v1/orderbook?markets=${batch.join(",")}`,
        { timeoutMs: 5000 },
      );
      if (!Array.isArray(payload)) continue;
      for (const entry of payload) {
        const marketId = typeof entry?.market === "string" ? entry.market : "";
        const symbol = marketId ? idToSymbol.get(marketId) : undefined;
        if (!symbol) continue;
        const unit = Array.isArray(entry?.orderbook_units) ? entry.orderbook_units[0] : null;
        const bid = Number(unit?.bid_price ?? 0);
        const ask = Number(unit?.ask_price ?? 0);
        if (bid > 0 && ask > 0) out[symbol] = { bid, ask };
      }
    } catch {
      // ignore
    }
  }
  return out;
}

async function fetchBithumbTickerQuotes(symbols: string[]): Promise<Record<string, MarketQuote>> {
  const out: Record<string, MarketQuote> = {};
  const baseToSymbol = new Map<string, string>();
  for (const symbol of symbols) {
    let base = "";
    if (symbol.includes("_")) base = symbol.split("_")[0] ?? "";
    else if (symbol.includes("/")) base = symbol.split("/")[0] ?? "";
    else if (symbol.includes("-")) base = symbol.split("-")[0] ?? "";
    base = base.toUpperCase();
    if (base) baseToSymbol.set(base, symbol);
  }
  if (!baseToSymbol.size) return out;

  try {
    const payload = await fetchJson<any>("https://api.bithumb.com/public/orderbook/ALL_KRW", { timeoutMs: 5000 });
    const data = payload?.data;
    if (!data || typeof data !== "object") return out;
    for (const [base, symbol] of baseToSymbol.entries()) {
      const entry = data[base];
      const bid = Number(entry?.bids?.[0]?.price ?? 0);
      const ask = Number(entry?.asks?.[0]?.price ?? 0);
      if (bid > 0 && ask > 0) out[symbol] = { bid, ask };
    }
  } catch {
    return out;
  }

  return out;
}

async function fetchQuotesBySymbolViaTickers(
  exchange: any,
  symbols: string[],
): Promise<Record<string, MarketQuote>> {
  const out: Record<string, MarketQuote> = {};
  if (!symbols.length) return out;
  const exchangeId = String(exchange?.id ?? "").toLowerCase();

  if (exchangeId === "upbit" || exchangeId === "upbit-rest") {
    const upbitQuotes = await fetchUpbitOrderbookQuotes(exchange, symbols);
    if (Object.keys(upbitQuotes).length) return upbitQuotes;
  }

  if (exchangeId === "bithumb" || exchangeId === "bithumb-rest") {
    const bithumbQuotes = await fetchBithumbTickerQuotes(symbols);
    if (Object.keys(bithumbQuotes).length) return bithumbQuotes;
  }

  const tryFetch = async (symbolsArg: string[] | undefined) => {
    if (typeof exchange.fetchTickers !== "function") return null;
    return await exchange.fetchTickers(symbolsArg);
  };

  let tickers: any = null;
  try {
    tickers = await tryFetch(symbols);
  } catch {
    try {
      tickers = await tryFetch(undefined);
    } catch {
      return out;
    }
  }
  if (!tickers || typeof tickers !== "object") return out;

  for (const symbol of symbols) {
    const t = tickers[symbol];
    const bid = Number(t?.bid ?? 0);
    const ask = Number(t?.ask ?? 0);
    if (bid > 0 && ask > 0) out[symbol] = { bid, ask };
  }
  return out;
}

async function snapshotReverseRowsForCoins(params: {
  domestic: any;
  gateSpot?: any;
  gatePerp: any;
  symbolMaps: {
    domesticSymbols: Record<string, string>;
    gateioSpotSymbols: Record<string, string>;
    gateioPerpSymbols: Record<string, string>;
  };
  domesticFeeRate: number;
  overseasSpotFeeRate: number;
  overseasPerpFeeRate: number;
  coins: string[];
  usdtKrw: number;
  concurrency?: number;
  onProgress?: (done: number, total: number) => void;
  pricingMode?: "ticker" | "vwap_market";
  notionalKrw?: number;
  orderbookDepth?: number;
}): Promise<
  Array<{
    coin: string;
    premiumPct: number;
    domesticAsk: number;
    domesticBid: number | undefined;
    overseasBid: number;
    overseasAsk: number | undefined;
    gateioSpotAsk?: number;
    gateioSpotBid?: number;
    gateioSpotSellUsdt?: number;
    spotVsPerpPct?: number;
    liquidity?: {
      domestic?: { impactPct: number; levels: number };
      gateioSpot?: { impactPct: number; levels: number };
      gateioPerp?: { impactPct: number; levels: number };
    };
  }>
> {
  const { domestic, gateSpot, gatePerp, symbolMaps, coins, usdtKrw, domesticFeeRate, overseasSpotFeeRate, overseasPerpFeeRate } = params;
  const concurrency = params.concurrency ?? DEFAULT_SCAN_CONCURRENCY;
  const onProgress = params.onProgress;
  const pricingMode = params.pricingMode ?? "ticker";
  const orderbookDepth = params.orderbookDepth ?? DEFAULT_ORDERBOOK_DEPTH;
  const total = coins.length;

  if (pricingMode === "vwap_market") {
    const notionalKrw = Number(params.notionalKrw ?? 0);
    if (!(notionalKrw > 0)) throw new Error("snapshotReverseRowsForCoins: notionalKrw must be > 0 for vwap_market mode.");

    const preFeeNotionalKrw = notionalKrw / (1.0 + domesticFeeRate);
    type VwapRow = {
      coin: string;
      premiumPct: number;
      domesticAsk: number;
      domesticBid: number | undefined;
      overseasBid: number;
      overseasAsk: number | undefined;
      gateioSpotAsk: number | undefined;
      gateioSpotBid: number | undefined;
      gateioSpotSellUsdt: number | undefined;
      spotVsPerpPct: number | undefined;
      liquidity: {
        domestic: { impactPct: number; levels: number };
        gateioSpot: { impactPct: number; levels: number } | undefined;
        gateioPerp: { impactPct: number; levels: number };
      };
    };

    let done = 0;
    const rows = (
      await asyncPool(concurrency, coins, async (coin) => {
        const domesticSymbol = symbolMaps.domesticSymbols[coin];
        const gateSpotSymbol = symbolMaps.gateioSpotSymbols?.[coin];
        const gatePerpSymbol = symbolMaps.gateioPerpSymbols[coin];
        done += 1;
        if (onProgress && (done % 50 === 0 || done === total)) onProgress(done, total);
        if (!domesticSymbol || !gatePerpSymbol) return null;

        const [bOb, pOb, sOb] = await Promise.all([
          fetchOrderbook(domestic, domesticSymbol, orderbookDepth),
          fetchOrderbook(gatePerp, gatePerpSymbol, orderbookDepth),
          gateSpot && gateSpotSymbol ? fetchOrderbook(gateSpot, gateSpotSymbol, orderbookDepth) : Promise.resolve(null),
        ]);
        if (!bOb || !pOb) return null;

        const bFill = analyzeBuyFillFromQuote((bOb as any).asks, preFeeNotionalKrw);
        if (!bFill) return null;

        const pFill = analyzeSellFillFromBase((pOb as any).bids, bFill.baseQty);
        if (!pFill) return null;

        const domesticAsk = applyFee(bFill.vwapPrice, domesticFeeRate, "buy");
        const overseasBid = applyFee(pFill.vwapPrice, overseasPerpFeeRate, "sell");
        const bBestBid = Number((bOb as any)?.bids?.[0]?.[0] ?? 0);
        const pBestAsk = Number((pOb as any)?.asks?.[0]?.[0] ?? 0);
        const domesticBid = bBestBid > 0 ? applyFee(bBestBid, domesticFeeRate, "sell") : undefined;
        const overseasAsk = pBestAsk > 0 ? applyFee(pBestAsk, overseasPerpFeeRate, "buy") : undefined;
        if (!(domesticAsk > 0 && overseasBid > 0)) return null;

        let gateioSpotAsk: number | undefined;
        let gateioSpotBid: number | undefined;
        let gateioSpotSellUsdt: number | undefined;
        let spotVsPerpPct: number | undefined;
        let spotImp: { impactPct: number; levels: number } | undefined;
        if (sOb) {
          const sBestAsk = Number((sOb as any)?.asks?.[0]?.[0] ?? 0);
          if (sBestAsk > 0) gateioSpotAsk = applyFee(sBestAsk, overseasSpotFeeRate, "buy");
          const sFill = analyzeSellFillFromBase((sOb as any).bids, bFill.baseQty);
          if (sFill) {
            gateioSpotBid = applyFee(sFill.vwapPrice, overseasSpotFeeRate, "sell");
            gateioSpotSellUsdt = gateioSpotBid * bFill.baseQty;
            spotImp = { impactPct: sFill.impactPct, levels: sFill.levels };
            if (gateioSpotBid > 0) spotVsPerpPct = ((overseasBid - gateioSpotBid) / gateioSpotBid) * 100.0;
          }
        }

        const pct = premiumPct(domesticAsk, overseasBid, usdtKrw);
        return {
          coin,
          premiumPct: pct,
          domesticAsk,
          domesticBid,
          overseasBid,
          overseasAsk,
          gateioSpotAsk,
          gateioSpotBid,
          gateioSpotSellUsdt,
          spotVsPerpPct,
          liquidity: {
            domestic: { impactPct: bFill.impactPct, levels: bFill.levels },
            gateioSpot: spotImp,
            gateioPerp: { impactPct: pFill.impactPct, levels: pFill.levels },
          },
        };
      })
    ).filter((x): x is VwapRow => Boolean(x));

    return rows;
  }

  const notionalKrw = Number(params.notionalKrw ?? 0);
  type TickerRow = {
    coin: string;
    premiumPct: number;
    domesticAsk: number;
    domesticBid: number;
    overseasBid: number;
    overseasAsk: number;
    gateioSpotAsk: number | undefined;
    gateioSpotBid: number | undefined;
    gateioSpotSellUsdt: number | undefined;
    spotVsPerpPct: number | undefined;
  };
  const domesticSymbols = coins.map((c) => symbolMaps.domesticSymbols[c]).filter((s): s is string => Boolean(s));
  const gatePerpSymbols = coins.map((c) => symbolMaps.gateioPerpSymbols[c]).filter((s): s is string => Boolean(s));
  const gateSpotSymbols = gateSpot ? coins.map((c) => symbolMaps.gateioSpotSymbols?.[c]).filter((s): s is string => Boolean(s)) : [];

  const [bTickerQuotes, pTickerQuotes, sTickerQuotes] = await Promise.all([
    fetchQuotesBySymbolViaTickers(domestic, domesticSymbols),
    fetchQuotesBySymbolViaTickers(gatePerp, gatePerpSymbols),
    gateSpot && gateSpotSymbols.length ? fetchQuotesBySymbolViaTickers(gateSpot, gateSpotSymbols) : Promise.resolve({}),
  ]);

  const rowsFromTickers: TickerRow[] = [];
  for (const coin of coins) {
    const bSymbol = symbolMaps.domesticSymbols[coin];
    const pSymbol = symbolMaps.gateioPerpSymbols[coin];
    const sSymbol = gateSpot ? symbolMaps.gateioSpotSymbols?.[coin] : undefined;
    if (!bSymbol || !pSymbol) continue;
    const bRaw = bTickerQuotes[bSymbol];
    const pRaw = pTickerQuotes[pSymbol];
    if (!bRaw || !pRaw) continue;

    const b = feeAdjustedQuote(bRaw, domesticFeeRate, domesticFeeRate);
    const p = feeAdjustedQuote(pRaw, overseasPerpFeeRate, overseasPerpFeeRate);
    if (!(b.ask > 0 && p.bid > 0)) continue;

    let gateioSpotAsk: number | undefined;
    let gateioSpotBid: number | undefined;
    let gateioSpotSellUsdt: number | undefined;
    let spotVsPerpPct: number | undefined;
    const sRaw = sSymbol ? (sTickerQuotes as any)[sSymbol] : undefined;
    if (sRaw) {
      const s = feeAdjustedQuote(sRaw, overseasSpotFeeRate, overseasSpotFeeRate);
      if (s.ask > 0) gateioSpotAsk = s.ask;
      if (s.bid > 0) {
        gateioSpotBid = s.bid;
        if (notionalKrw > 0) {
          const baseQty = notionalKrw / b.ask;
          gateioSpotSellUsdt = gateioSpotBid * baseQty;
        }
        spotVsPerpPct = ((p.bid - gateioSpotBid) / gateioSpotBid) * 100.0;
      }
    }

    rowsFromTickers.push({
      coin,
      premiumPct: premiumPct(b.ask, p.bid, usdtKrw),
      domesticAsk: b.ask,
      domesticBid: b.bid,
      overseasBid: p.bid,
      overseasAsk: p.ask,
      gateioSpotAsk,
      gateioSpotBid,
      gateioSpotSellUsdt,
      spotVsPerpPct,
    });
  }

  // If we got >= 80% from tickers, only fetch the missing coins (not all)
  const tickerCoinSet = new Set(rowsFromTickers.map((r) => r.coin));
  const missingFromTickers = coins.filter((c) => !tickerCoinSet.has(c));

  if (rowsFromTickers.length > 0 && missingFromTickers.length === 0) {
    return rowsFromTickers; // All coins fetched via tickers
  }

  // If we have most coins from tickers, only fetch missing ones
  const coinsToFetch = rowsFromTickers.length >= Math.max(1, Math.floor(coins.length * 0.5))
    ? missingFromTickers  // Fetch only missing coins
    : coins;              // Fetch all coins via REST

  let done = 0;
  const rows = (
    await asyncPool(concurrency, coinsToFetch, async (coin) => {
      const domesticSymbol = symbolMaps.domesticSymbols[coin];
      const gateSpotSymbol = gateSpot ? symbolMaps.gateioSpotSymbols?.[coin] : undefined;
      const gatePerpSymbol = symbolMaps.gateioPerpSymbols[coin];
      done += 1;
      if (onProgress && (done % 50 === 0 || done === total)) onProgress(done, total);
      if (!domesticSymbol || !gatePerpSymbol) return null;

      const [bRaw, pRaw, sRaw] = await Promise.all([
        fetchQuote(domestic, domesticSymbol),
        fetchQuote(gatePerp, gatePerpSymbol),
        gateSpot && gateSpotSymbol ? fetchQuote(gateSpot, gateSpotSymbol) : Promise.resolve(null),
      ]);
      if (!bRaw || !pRaw) return null;

      const b = feeAdjustedQuote(bRaw, domesticFeeRate, domesticFeeRate);
      const p = feeAdjustedQuote(pRaw, overseasPerpFeeRate, overseasPerpFeeRate);
      if (!(b.ask > 0 && p.bid > 0)) return null;

      let gateioSpotAsk: number | undefined;
      let gateioSpotBid: number | undefined;
      let gateioSpotSellUsdt: number | undefined;
      let spotVsPerpPct: number | undefined;
      if (sRaw) {
        const s = feeAdjustedQuote(sRaw, overseasSpotFeeRate, overseasSpotFeeRate);
        if (s.ask > 0) gateioSpotAsk = s.ask;
        if (s.bid > 0) {
          gateioSpotBid = s.bid;
          if (notionalKrw > 0) {
            const baseQty = notionalKrw / b.ask;
            gateioSpotSellUsdt = gateioSpotBid * baseQty;
          }
          spotVsPerpPct = ((p.bid - gateioSpotBid) / gateioSpotBid) * 100.0;
        }
      }

      const pct = premiumPct(b.ask, p.bid, usdtKrw);
      return {
        coin,
        premiumPct: pct,
        domesticAsk: b.ask,
        domesticBid: b.bid,
        overseasBid: p.bid,
        overseasAsk: p.ask,
        gateioSpotAsk,
        gateioSpotBid,
        gateioSpotSellUsdt,
        spotVsPerpPct,
      };
    })
  ).filter((x): x is TickerRow => Boolean(x));

  // Merge ticker results with individual REST results
  return [...rowsFromTickers, ...rows];
}

function showTop(opps: Array<{ coin: string; premiumPct: number; domesticPrice: number; overseasPrice: number; usdtKrw: number }>, limit = 15) {
  if (!opps.length) {
    console.info("  (없음)");
    return;
  }
  opps.slice(0, limit).forEach((opp, idx) => {
    console.info(
      `${String(idx + 1).padStart(2, " ")} ) ${opp.coin.padEnd(10)} ${opp.premiumPct >= 0 ? "+" : ""}${opp.premiumPct.toFixed(3)}% | BITHUMB=${Math.round(opp.domesticPrice).toLocaleString()} | GATEIO=${opp.overseasPrice} | USDTKRW=${Math.round(opp.usdtKrw).toLocaleString()}`,
    );
  });
}

function applyFeeToQuotes(
  quotes: Record<string, MarketQuote>,
  buyFeeRate: number,
  sellFeeRate: number,
): Record<string, MarketQuote> {
  const out: Record<string, MarketQuote> = {};
  for (const [coin, quote] of Object.entries(quotes)) out[coin] = feeAdjustedQuote(quote, buyFeeRate, sellFeeRate);
  return out;
}

function logTransferEta(chainPairs: Array<[string, string]>, bStatus: any, gStatus: any, direction: string) {
  const entries = buildTransferEtaEntries(chainPairs, bStatus, gStatus, direction as any);
  if (!entries.length) {
    console.info("체인 예상 입금 소요: 정보 없음");
    return;
  }
  console.info("체인 예상 입금 소요(추정, 수신 기준):");
  for (const entry of entries) {
    const pair = `${entry.canonicalChain} (${entry.bithumbChain}↔${entry.gateioChain})`;
    if (entry.minutes != null) {
      if (entry.confirmations) console.info(`  - ${pair}: ${entry.receiveLabel} 컨펌 ${entry.confirmations}, 약 ${entry.minutes}분`);
      else console.info(`  - ${pair}: ${entry.receiveLabel} 컨펌 정보 없음, 1회 기준 약 ${entry.minutes}분`);
    } else if (entry.confirmations != null) {
      console.info(`  - ${pair}: ${entry.receiveLabel} 컨펌 ${entry.confirmations}, 시간 정보 없음`);
    } else {
      console.info(`  - ${pair}: ${entry.receiveLabel} 컨펌 정보 없음, 시간 정보 없음`);
    }
  }
}

export async function scanReverseClosestToZero(
  limit = DEFAULT_SCAN_LIMIT,
  orderbookDepth = DEFAULT_ORDERBOOK_DEPTH,
): Promise<void> {
  const bithumb = await createBithumb(false);
  const gateSpot = await createGateioSpot(false, true);
  const gatePerp = await createGateioPerp(false, true);

  const rateSource = usdtKrwRateSource();
  const rate = await usdtKrwRateContext(rateSource);
  const usdtKrw = rate.usdtKrw;
  console.info(`USDT/KRW (${rate.label}): ${Math.round(usdtKrw).toLocaleString()}`);
  if (rate.usdtPremiumPct != null && rate.fxUsdKrw != null && rate.domesticUsdtKrw != null) {
    console.info(
      `USDT premium vs FX (${rate.premiumSource ?? "domestic"}): ${rate.usdtPremiumPct >= 0 ? "+" : ""}${rate.usdtPremiumPct.toFixed(2)}% (FX=${Math.round(rate.fxUsdKrw).toLocaleString()}, KRW-USDT=${Math.round(rate.domesticUsdtKrw).toLocaleString()})`,
    );
  }

  const universe = await getArbitrageSymbolUniverse(bithumb, gateSpot, gatePerp);
  const candidates = universe.reverseCandidates;
  if (!candidates.length) throw new Error("No overlapping Bithumb(KRW) / GateIO(perp) coins found.");

  const rows: Array<{
    coin: string;
    premiumPct: number;
    domesticAsk: number;
    overseasBid: number;
  }> = [];

  console.info(`\n[SCAN] 계산 중... (총 ${candidates.length}개)`);
  console.info(`(역프 기준: Bithumb 매수=ask / GateIO 선물 숏=bid, fee 반영)`);

  for (const coin of candidates) {
    const bithumbSymbol = universe.bithumbKrwSymbols[coin];
    const gatePerpSymbol = universe.gateioPerpSymbols[coin];
    if (!bithumbSymbol || !gatePerpSymbol) continue;

    const [bRaw, pRaw] = await Promise.all([fetchQuote(bithumb, bithumbSymbol), fetchQuote(gatePerp, gatePerpSymbol)]);
    if (!bRaw || !pRaw) continue;

    const b = feeAdjustedQuote(bRaw, BITHUMB_SPOT_TAKER_FEE, BITHUMB_SPOT_TAKER_FEE);
    const p = feeAdjustedQuote(pRaw, GATEIO_PERP_TAKER_FEE, GATEIO_PERP_TAKER_FEE);
    if (!(b.ask > 0 && p.bid > 0)) continue;

    const pct = premiumPct(b.ask, p.bid, usdtKrw);
    rows.push({ coin, premiumPct: pct, domesticAsk: b.ask, overseasBid: p.bid });
    console.info(
      `- ${coin.padEnd(10)} ${pct >= 0 ? "+" : ""}${pct.toFixed(3)}% | BITHUMB ask=${Math.round(b.ask).toLocaleString()} | GATEIO bid=${p.bid}`,
    );
  }

  rows.sort(sortReversePreferred);

  console.info(`\n[SCAN] 역프 기준 '가격차이(프리미엄) 0% 근접' TOP ${Math.min(limit, rows.length)}`);
  console.info(`(fee 반영 / depth=${orderbookDepth} 미사용)`);
  for (const [idx, row] of rows.slice(0, Math.max(1, limit)).entries()) {
    console.info(
      `${String(idx + 1).padStart(2, " ")} ) ${row.coin.padEnd(10)} ${row.premiumPct >= 0 ? "+" : ""}${row.premiumPct.toFixed(3)}% | BITHUMB ask=${Math.round(row.domesticAsk).toLocaleString()} | GATEIO bid=${row.overseasBid}`,
    );
  }
}

export async function scanReverseAllOnce(options?: { sort?: "abs" | "premium" | "reverse"; concurrency?: number }): Promise<void> {
  const sort = options?.sort ?? "abs";
  const concurrency = options?.concurrency ?? DEFAULT_SCAN_CONCURRENCY;

  const bithumb = await createBithumb(false);
  const gateSpot = await createGateioSpot(false, true);
  const gatePerp = await createGateioPerp(false, true);

  const rateSource = usdtKrwRateSource();
  const rate = await usdtKrwRateContext(rateSource);
  const usdtKrw = rate.usdtKrw;
  console.info(`USDT/KRW (${rate.label}): ${Math.round(usdtKrw).toLocaleString()}`);
  if (rate.usdtPremiumPct != null && rate.fxUsdKrw != null && rate.domesticUsdtKrw != null) {
    console.info(
      `USDT premium vs FX (${rate.premiumSource ?? "domestic"}): ${rate.usdtPremiumPct >= 0 ? "+" : ""}${rate.usdtPremiumPct.toFixed(2)}% (FX=${Math.round(rate.fxUsdKrw).toLocaleString()}, KRW-USDT=${Math.round(rate.domesticUsdtKrw).toLocaleString()})`,
    );
  }

  const universe = await getArbitrageSymbolUniverse(bithumb, gateSpot, gatePerp);
  const candidates = universe.reverseCandidates;
  if (!candidates.length) throw new Error("No overlapping Bithumb(KRW) / GateIO(perp) coins found.");

  console.info(`\n[SCAN] 전체 코인 스냅샷 수집 중... (총 ${candidates.length}개)`);

  const bithumbSymbols = candidates.map((c) => universe.bithumbKrwSymbols[c]).filter((s): s is string => Boolean(s));
  const gatePerpSymbols = candidates.map((c) => universe.gateioPerpSymbols[c]).filter((s): s is string => Boolean(s));

  const [bTickerQuotes, pTickerQuotes] = await Promise.all([
    fetchQuotesBySymbolViaTickers(bithumb as any, bithumbSymbols),
    fetchQuotesBySymbolViaTickers(gatePerp as any, gatePerpSymbols),
  ]);

  const tickerHitRate =
    (Object.keys(bTickerQuotes).length + Object.keys(pTickerQuotes).length) /
    Math.max(1, bithumbSymbols.length + gatePerpSymbols.length);

  if (tickerHitRate >= 0.6) {
    console.info(
      `[SCAN] fast-path: fetchTickers 사용 (bithumb=${Object.keys(bTickerQuotes).length}/${bithumbSymbols.length}, gateio_perp=${Object.keys(pTickerQuotes).length}/${gatePerpSymbols.length})`,
    );

    const rows: Array<{ coin: string; premiumPct: number; domesticAsk: number; overseasBid: number }> = [];
    for (const coin of candidates) {
      const bSymbol = universe.bithumbKrwSymbols[coin];
      const pSymbol = universe.gateioPerpSymbols[coin];
      if (!bSymbol || !pSymbol) continue;
      const bRaw = bTickerQuotes[bSymbol];
      const pRaw = pTickerQuotes[pSymbol];
      if (!bRaw || !pRaw) continue;

      const b = feeAdjustedQuote(bRaw, BITHUMB_SPOT_TAKER_FEE, BITHUMB_SPOT_TAKER_FEE);
      const p = feeAdjustedQuote(pRaw, GATEIO_PERP_TAKER_FEE, GATEIO_PERP_TAKER_FEE);
      if (!(b.ask > 0 && p.bid > 0)) continue;
      rows.push({ coin, premiumPct: premiumPct(b.ask, p.bid, usdtKrw), domesticAsk: b.ask, overseasBid: p.bid });
    }

    if (sort === "premium") rows.sort((a, b) => a.premiumPct - b.premiumPct);
    else if (sort === "reverse") rows.sort(sortReversePreferred);
    else rows.sort((a, b) => Math.abs(a.premiumPct) - Math.abs(b.premiumPct));

    console.info(`\n[SCAN] 완료: ${rows.length}/${candidates.length}개 가격 수집`);
    console.info("(역프 기준: Bithumb 매수=ask / GateIO 선물 숏=bid, fee 반영)");
    for (const [idx, row] of rows.entries()) {
      console.info(
        `${String(idx + 1).padStart(3, " ")} ) ${row.coin.padEnd(10)} ${row.premiumPct >= 0 ? "+" : ""}${row.premiumPct.toFixed(3)}% | BITHUMB ask=${Math.round(row.domesticAsk).toLocaleString()} | GATEIO bid=${row.overseasBid}`,
      );
    }
    return;
  }

  console.info(`[SCAN] fast-path unavailable → fallback (per-symbol, concurrency=${concurrency})`);

  let done = 0;
  const rows = (
    await asyncPool(concurrency, candidates, async (coin) => {
      const bithumbSymbol = universe.bithumbKrwSymbols[coin];
      const gatePerpSymbol = universe.gateioPerpSymbols[coin];
      if (!bithumbSymbol || !gatePerpSymbol) {
        done += 1;
        return null;
      }

      const [bRaw, pRaw] = await Promise.all([fetchQuote(bithumb, bithumbSymbol), fetchQuote(gatePerp, gatePerpSymbol)]);
      done += 1;
      if (done % 25 === 0) console.info(`[SCAN] progress: ${done}/${candidates.length}`);
      if (!bRaw || !pRaw) return null;

      const b = feeAdjustedQuote(bRaw, BITHUMB_SPOT_TAKER_FEE, BITHUMB_SPOT_TAKER_FEE);
      const p = feeAdjustedQuote(pRaw, GATEIO_PERP_TAKER_FEE, GATEIO_PERP_TAKER_FEE);
      if (!(b.ask > 0 && p.bid > 0)) return null;

      const pct = premiumPct(b.ask, p.bid, usdtKrw);
      return { coin, premiumPct: pct, domesticAsk: b.ask, overseasBid: p.bid };
    })
  ).filter((x): x is { coin: string; premiumPct: number; domesticAsk: number; overseasBid: number } => Boolean(x));

  if (sort === "premium") rows.sort((a, b) => a.premiumPct - b.premiumPct);
  else if (sort === "reverse") rows.sort(sortReversePreferred);
  else rows.sort((a, b) => Math.abs(a.premiumPct) - Math.abs(b.premiumPct));

  console.info(`\n[SCAN] 완료: ${rows.length}/${candidates.length}개 가격 수집`);
  console.info("(역프 기준: Bithumb 매수=ask / GateIO 선물 숏=bid, fee 반영)");
  for (const [idx, row] of rows.entries()) {
    console.info(
      `${String(idx + 1).padStart(3, " ")} ) ${row.coin.padEnd(10)} ${row.premiumPct >= 0 ? "+" : ""}${row.premiumPct.toFixed(3)}% | BITHUMB ask=${Math.round(row.domesticAsk).toLocaleString()} | GATEIO bid=${row.overseasBid}`,
    );
  }
}

function formatTransferInfoText(info: WatchTransfer | undefined, coin: string): string {
  if (!info) return "";
  const label = info.direction === "b2g" ? "B→G" : "G→B";
  if (!info.chains.length) return ` | xfer ${label}: n/a`;
  const parts = info.chains.map((chain) => {
    const feeStr =
      chain.feeCoin != null
        ? `${formatCoinAmount(chain.feeCoin, coin)}${chain.feeKrw != null ? ` (≈${formatKrw(chain.feeKrw)})` : ""}`
        : "fee?";
    const minStr =
      chain.minCoin != null
        ? `, min=${formatCoinAmount(chain.minCoin, coin)}${chain.minKrw != null ? ` (≈${formatKrw(chain.minKrw)})` : ""}`
        : "";
    return `${chain.senderChain}↔${chain.receiverChain}(${feeStr}${minStr})`;
  });
  return ` | xfer ${label}: ${parts.join(", ")}`;
}

export async function watchReverseTopN(
  options?: {
    topN?: number;
    displayTopK?: number;
    displayFarK?: number;
    intervalSec?: number;
    concurrency?: number;
    notionalKrw?: number;
    useWebsocket?: boolean;
    wsOnly?: boolean;
    fullUniverse?: boolean;
    domesticExchange?: "bithumb" | "upbit";
    overseasExchange?: OverseasExchange;
    sharedOverseas?: SharedOverseasResources;
    sharedDomestic?: SharedDomesticResources;
  },
  handlers?: { onTick?: (payload: WatchReverseTick) => void; onStatus?: (status: WatchStatus) => void; silent?: boolean; signal?: AbortSignal },
): Promise<void> {
  const silent = handlers?.silent === true;
  const onTick = handlers?.onTick;
  const onStatus = handlers?.onStatus;
  const signal = handlers?.signal;
  const topN = Math.max(1, Math.trunc(options?.topN ?? 10));
  const displayTopK = Math.max(1, Math.min(topN, Math.trunc(options?.displayTopK ?? 5)));
  const displayFarK = Math.max(0, Math.min(topN - displayTopK, Math.trunc(options?.displayFarK ?? displayTopK)));
  const intervalSec = Math.max(1, Math.trunc(options?.intervalSec ?? DEFAULT_WATCH_INTERVAL_SEC));
  const concurrency = Math.max(1, Math.trunc(options?.concurrency ?? DEFAULT_SCAN_CONCURRENCY));
  const notionalKrw = Math.max(1, Number(options?.notionalKrw ?? DEFAULT_WATCH_NOTIONAL_KRW));
  const fullUniverse = options?.fullUniverse ?? false;
  const domesticExchange: "bithumb" | "upbit" = options?.domesticExchange === "upbit" ? "upbit" : "bithumb";
  const overseasExchange: OverseasExchange =
    options?.overseasExchange === "bybit"
      ? "bybit"
      : options?.overseasExchange === "okx"
        ? "okx"
        : options?.overseasExchange === "hyperliquid"
          ? "hyperliquid"
          : options?.overseasExchange === "lighter"
            ? "lighter"
            : "gateio";
  const useLighter = overseasExchange === "lighter";
  const wsOnly = useLighter ? true : options?.wsOnly ?? false;
  const domesticLabel = domesticExchange === "upbit" ? "Upbit" : "Bithumb";
  const overseasLabel =
    overseasExchange === "bybit"
      ? "Bybit"
      : overseasExchange === "okx"
        ? "OKX"
        : overseasExchange === "hyperliquid"
          ? "Hyperliquid"
          : overseasExchange === "lighter"
            ? "Lighter"
            : "GateIO";
  const domesticFeeRate = domesticExchange === "upbit" ? UPBIT_SPOT_TAKER_FEE : BITHUMB_SPOT_TAKER_FEE;
  const overseasSpotFeeRate =
    overseasExchange === "bybit"
      ? BYBIT_SPOT_TAKER_FEE
      : overseasExchange === "okx"
        ? OKX_SPOT_TAKER_FEE
        : overseasExchange === "hyperliquid"
          ? HYPERLIQUID_SPOT_TAKER_FEE
          : overseasExchange === "lighter"
            ? LIGHTER_SPOT_TAKER_FEE
            : GATEIO_SPOT_TAKER_FEE;
  const overseasPerpFeeRate =
    overseasExchange === "bybit"
      ? BYBIT_PERP_TAKER_FEE
      : overseasExchange === "okx"
        ? OKX_PERP_TAKER_FEE
        : overseasExchange === "hyperliquid"
          ? HYPERLIQUID_PERP_TAKER_FEE
          : overseasExchange === "lighter"
            ? LIGHTER_PERP_TAKER_FEE
            : GATEIO_PERP_TAKER_FEE;
  const config = {
    topN,
    displayTopK,
    displayFarK,
    intervalSec,
    concurrency,
    notionalKrw,
    fullUniverse,
    domesticExchange,
    overseasExchange,
  };

  const emitStatus = (status: WatchStatus): void => {
    if (!onStatus) return;
    try {
      onStatus(status);
    } catch (err) {
      console.warn(`[WATCH] onStatus failed: ${String(err)}`);
    }
  };

  const sharedOverseas = options?.sharedOverseas?.exchange === overseasExchange ? options.sharedOverseas : undefined;
  const sharedDomestic = options?.sharedDomestic?.exchange === domesticExchange ? options.sharedDomestic : undefined;
  const domestic = { id: domesticExchange === "upbit" ? "upbit-rest" : "bithumb-rest" } as any;
  const gateSpot =
    sharedOverseas?.spot ??
    (useLighter
      ? undefined
      : overseasExchange === "bybit"
        ? await createBybitSpot(false)
        : overseasExchange === "okx"
          ? await createOkxSpot(false)
          : overseasExchange === "hyperliquid"
            ? await createHyperliquidSpot(false)
            : await createGateioSpot(false, false));
  const gatePerp =
    sharedOverseas?.perp ??
    (useLighter
      ? undefined
      : overseasExchange === "bybit"
        ? await createBybitPerp(false)
        : overseasExchange === "okx"
          ? await createOkxPerp(false)
          : overseasExchange === "hyperliquid"
            ? await createHyperliquidPerp(false)
            : await createGateioPerp(false, true));
  const ownsGateSpot = !sharedOverseas?.spot && Boolean(gateSpot);
  const ownsGatePerp = !sharedOverseas?.perp && Boolean(gatePerp);
  let wsClients: {
    domestic: BithumbOrderbookWs | UpbitOrderbookWs;
    gatePerp:
      | GateioFuturesBookTickerWs
      | BybitPerpOrderbookWs
      | OkxPerpTickerWs
      | HyperliquidPerpOrderbookWs
      | LighterPerpOrderbookWs;
    gateSpot?: GateioSpotTickerWs | BybitSpotOrderbookWs | OkxSpotTickerWs | HyperliquidSpotOrderbookWs | LighterSpotOrderbookWs;
  } | null = null;
  let ownsDomesticWs = true;
  let ownsGatePerpWs = true;
  let ownsGateSpotWs = true;
  type PricingRow = {
    domesticAsk: number;
    domesticBid?: number;
    overseasBid: number;
    overseasAsk?: number;
    gateioSpotAsk?: number;
    gateioSpotBid?: number;
  };

  const selectPricing = (
    row: PricingRow,
    direction: "b2g" | "g2b",
  ): { domesticPrice: number; overseasPrice: number; gapSource: "spot" | "perp"; useUnwind: boolean } | null => {
    const hasSpotBid = row.gateioSpotBid != null && row.gateioSpotBid > 0;
    const hasSpotAsk = row.gateioSpotAsk != null && row.gateioSpotAsk > 0;
    const hasPerpBid = row.overseasBid > 0;
    const hasPerpAsk = row.overseasAsk != null && row.overseasAsk > 0;
    const hasDomesticAsk = row.domesticAsk > 0;
    const hasDomesticBid = row.domesticBid != null && row.domesticBid > 0;
    if (direction === "b2g") {
      if (!(hasDomesticAsk && hasSpotBid && hasPerpBid)) return null;
      const basis = basisPct(row.gateioSpotBid as number, row.overseasBid);
      if (basis > DEFAULT_B2G_BASIS_MAX_PCT) return null;
      return { domesticPrice: row.domesticAsk, overseasPrice: row.gateioSpotBid as number, gapSource: "spot", useUnwind: false };
    }
    const canReverse = hasDomesticAsk && hasPerpBid;
    const canUnwind = hasDomesticBid && (hasSpotAsk || hasPerpAsk);
    const useUnwind = direction === "g2b" && canUnwind;
    const useReverse = canReverse && (!useUnwind || !canUnwind);
    if (!useUnwind && !useReverse) return null;

    const domesticPrice = useUnwind ? (row.domesticBid as number) : row.domesticAsk;
    const useSpot = direction === "g2b" ? hasSpotAsk : false;
    const overseasPrice = useSpot
      ? (row.gateioSpotAsk as number)
      : useUnwind
        ? row.overseasAsk
        : row.overseasBid;
    if (!(overseasPrice && overseasPrice > 0)) return null;
    return { domesticPrice, overseasPrice, gapSource: useSpot ? "spot" : "perp", useUnwind };
  };

  try {
    emitStatus({ phase: "init", message: "Loading symbol universe..." });
    const symbolMaps = await getWatchSymbolMaps(domesticExchange, overseasExchange, gateSpot, gatePerp);
    const candidates = Object.keys(symbolMaps.domesticSymbols).filter((c) => c in symbolMaps.gateioPerpSymbols).sort();
    if (!candidates.length) throw new Error(`No overlapping ${domesticLabel}(KRW) / ${overseasLabel}(perp) coins found.`);
    emitStatus({ phase: "init", message: `Universe loaded (${candidates.length} coins)` });

    const rateSource = usdtKrwRateSource();
    const initialRate = await usdtKrwRateContext(rateSource);
    if (!silent) console.info(`\n[WATCH] 초기 TOP ${topN} 리스트 계산 중... (총 ${candidates.length}개)`);
    let initialRows: SnapshotRow[] = [];
    if (!wsOnly) {
      emitStatus({ phase: "init", message: "Fetching initial quotes...", total: candidates.length, done: 0 });
      initialRows = await snapshotReverseRowsForCoins({
        domestic,
        gateSpot,
        gatePerp,
        symbolMaps,
        domesticFeeRate,
        overseasSpotFeeRate,
        overseasPerpFeeRate,
        coins: candidates,
        usdtKrw: initialRate.usdtKrw,
        concurrency,
        pricingMode: "ticker",
        notionalKrw,
        onProgress: (done, total) => {
          if (!silent) console.info(`[WATCH] init progress: ${done}/${total}`);
          emitStatus({ phase: "init", message: `Init progress ${done}/${total}`, done, total });
        },
      });
    } else {
      emitStatus({ phase: "init", message: "WebSocket-only mode: waiting for live quotes..." });
    }
    if (!initialRows.length) {
      emitStatus({ phase: "init", message: "Initial quotes empty; falling back to websocket updates." });
    } else {
      emitStatus({ phase: "init", message: `Initial list ready (${initialRows.length})` });
    }

    const initialB2G = initialRows.length
      ? initialRows
          .map((row) => {
            const pricing = selectPricing(row, "b2g");
            if (!pricing) return null;
            const premium = premiumPct(pricing.domesticPrice, pricing.overseasPrice, initialRate.usdtKrw);
            if (!(premium < 0)) return null;
            return { row, premium };
          })
          .filter((entry): entry is { row: SnapshotRow; premium: number } => Boolean(entry))
          .sort((a, b) => sortPremiumAsc({ premiumPct: a.premium, coin: a.row.coin }, { premiumPct: b.premium, coin: b.row.coin }))
      : [];
    const initialClosestCoins = initialB2G.slice(0, Math.min(displayTopK, initialB2G.length)).map((entry) => entry.row.coin);

    const initialG2B = initialRows.length
      ? initialRows
          .map((row) => {
            const pricing = selectPricing(row, "g2b");
            if (!pricing) return null;
            const premium = premiumPct(pricing.domesticPrice, pricing.overseasPrice, initialRate.usdtKrw);
            if (!(premium > 0)) return null;
            return { row, premium };
          })
          .filter((entry): entry is { row: SnapshotRow; premium: number } => Boolean(entry))
          .sort((a, b) => sortPremiumDesc({ premiumPct: a.premium, coin: a.row.coin }, { premiumPct: b.premium, coin: b.row.coin }))
      : [];
    const initialFarCoins = initialG2B.slice(0, Math.min(displayFarK, initialG2B.length)).map((entry) => entry.row.coin);

    const selectedSet = new Set<string>(
      initialRows.length ? [...initialClosestCoins, ...initialFarCoins] : fullUniverse ? [] : candidates.slice(0, topN),
    );
    const initialFill = [...initialB2G.slice(displayTopK), ...initialG2B.slice(displayFarK)];
    for (const entry of initialFill) {
      if (selectedSet.size >= Math.min(topN, initialRows.length)) break;
      if (selectedSet.has(entry.row.coin)) continue;
      selectedSet.add(entry.row.coin);
    }
    if (selectedSet.size < Math.min(topN, initialRows.length)) {
      for (const row of initialRows) {
        if (selectedSet.size >= Math.min(topN, initialRows.length)) break;
        if (selectedSet.has(row.coin)) continue;
        selectedSet.add(row.coin);
      }
    }
    if (!fullUniverse && !selectedSet.size) {
      for (const coin of candidates) {
        if (selectedSet.size >= topN) break;
        selectedSet.add(coin);
      }
    }

    const watchCoins = fullUniverse ? [...candidates] : Array.from(selectedSet);
    let closestCoins = initialClosestCoins;
    let farCoins = initialFarCoins;

    const wsEnv = String(process.env.ARB_USE_WS ?? "1").toLowerCase();
    const useWebsocket = useLighter ? true : (options?.useWebsocket ?? (wsEnv !== "0" && wsEnv !== "false"));
    type WsSymbolMap = {
      coin: string;
      domesticWsSymbol: string;
      gatePerpWsSymbol: string;
      gateSpotWsSymbol?: string;
    };
    let wsSymbolMaps: WsSymbolMap[] = [];
    let wsDomesticSymbols: string[] = [];
    let wsGatePerpSymbols: string[] = [];
    let wsGateSpotSymbols: string[] = [];

    if (useWebsocket) {
      try {
        const dSymbols = new Set<string>();
        const pSymbols = new Set<string>();
        const sSymbols = new Set<string>();
        const maps: WsSymbolMap[] = [];

        for (const coin of watchCoins) {
          const dSymbol = symbolMaps.domesticSymbols[coin];
          const pSymbol = symbolMaps.gateioPerpSymbols[coin];
          if (!dSymbol || !pSymbol) continue;

          const pMarket =
            overseasExchange === "lighter"
              ? null
              : ((gatePerp as any)?.market?.(pSymbol) ?? (gatePerp as any)?.markets?.[pSymbol]);
          const dWsSymbol = dSymbol;
          const pWsSymbol =
            overseasExchange === "hyperliquid"
              ? String(pMarket?.baseName ?? pMarket?.base ?? "")
              : overseasExchange === "lighter"
                ? String(pSymbol)
                : pMarket?.id
                  ? String(pMarket.id)
                  : "";
          if (!dWsSymbol || !pWsSymbol) continue;

          let sWsSymbol: string | undefined;
          const sSymbol = symbolMaps.gateioSpotSymbols?.[coin];
          if (sSymbol) {
            if (overseasExchange === "lighter") {
              sWsSymbol = String(sSymbol);
            } else if (gateSpot) {
              const sMarket = (gateSpot as any).market?.(sSymbol) ?? (gateSpot as any).markets?.[sSymbol];
              if (sMarket?.id) sWsSymbol = String(sMarket.id);
            }
          }

          maps.push({
            coin,
            domesticWsSymbol: dWsSymbol,
            gatePerpWsSymbol: pWsSymbol,
            gateSpotWsSymbol: sWsSymbol,
          });
          dSymbols.add(dWsSymbol);
          pSymbols.add(pWsSymbol);
          if (sWsSymbol) sSymbols.add(sWsSymbol);
        }

        if (maps.length) {
          emitStatus({ phase: "init", message: "Connecting WebSocket feeds..." });
          const domesticWs =
            sharedDomestic?.ws ??
            (domesticExchange === "upbit" ? new UpbitOrderbookWs([...dSymbols]) : new BithumbOrderbookWs([...dSymbols]));
          const sharedGatePerpWs = sharedOverseas?.perpWs;
          const sharedGateSpotWs = sharedOverseas?.spotWs;
          const gatePerpWs =
            sharedGatePerpWs ??
            (overseasExchange === "bybit"
              ? new BybitPerpOrderbookWs([...pSymbols])
              : overseasExchange === "okx"
                ? new OkxPerpTickerWs([...pSymbols])
                : overseasExchange === "hyperliquid"
                  ? new HyperliquidPerpOrderbookWs([...pSymbols])
                  : overseasExchange === "lighter"
                    ? new LighterPerpOrderbookWs([...pSymbols])
                  : new GateioFuturesBookTickerWs([...pSymbols]));
          const gateSpotWs =
            sharedGateSpotWs ??
            (sSymbols.size
              ? overseasExchange === "bybit"
                ? new BybitSpotOrderbookWs([...sSymbols])
                : overseasExchange === "okx"
                  ? new OkxSpotTickerWs([...sSymbols])
                  : overseasExchange === "hyperliquid"
                    ? new HyperliquidSpotOrderbookWs([...sSymbols])
                    : overseasExchange === "lighter"
                      ? new LighterSpotOrderbookWs([...sSymbols])
                    : new GateioSpotTickerWs([...sSymbols])
              : undefined);
          ownsDomesticWs = !sharedDomestic?.ws;
          ownsGatePerpWs = !sharedGatePerpWs;
          ownsGateSpotWs = !sharedGateSpotWs;
          wsClients = { domestic: domesticWs, gatePerp: gatePerpWs, gateSpot: gateSpotWs };
          wsSymbolMaps = maps;
          wsDomesticSymbols = [...dSymbols];
          wsGatePerpSymbols = [...pSymbols];
          wsGateSpotSymbols = [...sSymbols];
          await Promise.all([
            domesticWs.waitForSymbols(wsDomesticSymbols, 5000),
            gatePerpWs.waitForSymbols(wsGatePerpSymbols, 5000),
            gateSpotWs ? gateSpotWs.waitForSymbols(wsGateSpotSymbols, 5000) : Promise.resolve(),
          ]);
          emitStatus({ phase: "init", message: "WebSocket feeds ready" });
        }
      } catch (err) {
        console.warn(`[WATCH] websocket init failed: ${String(err)}`);
        emitStatus({ phase: "init", message: `WebSocket init failed: ${String(err)}` });
        wsClients = null;
      }
    }

    // Transfer status is now enabled for all exchange combinations
    const transferEnabled = true;
    if (!silent) {
      console.info(`\n[WATCH] 전송 네트워크/수수료 조회 중... (${domesticLabel}/${overseasLabel})`);
    }
    emitStatus({
      phase: "transfer",
      message: "Fetching transfer networks/fees...",
    });

    // Fetch domestic exchange transfer status
    const fetchDomesticTransfer = async (): Promise<Record<string, import("./models").TransferStatus>> => {
      if (domesticExchange === "upbit") {
        return upbitInoutStatuses(watchCoins);
      }
      return bithumbInoutStatuses(watchCoins);
    };

    // Fetch overseas exchange transfer status
    const fetchOverseasTransfer = async (): Promise<Record<string, import("./models").TransferStatus>> => {
      if (overseasExchange === "bybit") {
        return bybitCurrencyStatuses(gateSpot as any, watchCoins);
      }
      if (overseasExchange === "okx") {
        return okxCurrencyStatuses(gateSpot as any, watchCoins);
      }
      if (overseasExchange === "gateio") {
        return gateioCurrencyStatuses(gateSpot as any, watchCoins);
      }
      // For hyperliquid/lighter, return empty (no transfer status available)
      return {};
    };

    let [bTransfer, gTransfer] = await Promise.all([fetchDomesticTransfer(), fetchOverseasTransfer()]);
    let lastTransferRefreshMs = Date.now();
    const TRANSFER_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5분마다 갱신
    emitStatus({ phase: "transfer", message: "Transfer info loaded" });

    type SnapshotRow = {
      coin: string;
      premiumPct: number;
      domesticAsk: number;
      domesticBid: number | undefined;
      overseasBid: number;
      overseasAsk: number | undefined;
      gateioSpotAsk?: number;
      gateioSpotBid?: number;
      gateioSpotSellUsdt?: number;
      spotVsPerpPct?: number;
      liquidity?: {
        domestic?: { impactPct: number; levels: number };
        gateioSpot?: { impactPct: number; levels: number };
        gateioPerp?: { impactPct: number; levels: number };
      };
    };

    const lastByCoin: Record<string, SnapshotRow> = {};
    for (const row of initialRows) lastByCoin[row.coin] = row;

    const buildRowsFromWsQuotes = (usdtKrw: number): SnapshotRow[] => {
      if (!wsClients || !wsSymbolMaps.length) return [];
      const rows: SnapshotRow[] = [];
      for (const entry of wsSymbolMaps) {
        const bRaw = wsClients.domestic.getQuote(entry.domesticWsSymbol);
        const pRaw = wsClients.gatePerp.getQuote(entry.gatePerpWsSymbol);
        if (!bRaw || !pRaw) continue;

        const b = feeAdjustedQuote(bRaw, domesticFeeRate, domesticFeeRate);
        const p = feeAdjustedQuote(pRaw, overseasPerpFeeRate, overseasPerpFeeRate);
        if (!(b.ask > 0 && p.bid > 0)) continue;

        let gateioSpotAsk: number | undefined;
        let gateioSpotBid: number | undefined;
        let gateioSpotSellUsdt: number | undefined;
        let spotVsPerpPct: number | undefined;
        const sRaw = entry.gateSpotWsSymbol ? wsClients.gateSpot?.getQuote(entry.gateSpotWsSymbol) : undefined;
        if (sRaw) {
          const s = feeAdjustedQuote(sRaw, overseasSpotFeeRate, overseasSpotFeeRate);
          if (s.ask > 0) gateioSpotAsk = s.ask;
          if (s.bid > 0) {
            gateioSpotBid = s.bid;
            const baseQty = notionalKrw / b.ask;
            gateioSpotSellUsdt = gateioSpotBid * baseQty;
            spotVsPerpPct = ((p.bid - gateioSpotBid) / gateioSpotBid) * 100.0;
          }
        }

        rows.push({
          coin: entry.coin,
          premiumPct: premiumPct(b.ask, p.bid, usdtKrw),
          domesticAsk: b.ask,
          domesticBid: b.bid,
          overseasBid: p.bid,
          overseasAsk: p.ask,
          gateioSpotAsk,
          gateioSpotBid,
          gateioSpotSellUsdt,
          spotVsPerpPct,
        });
      }
      return rows;
    };

    const transferInfoForRow = (
      direction: "b2g" | "g2b",
      row: {
        coin: string;
        domesticPriceKrw: number;
        overseasPriceUsdt: number;
      },
      usdtKrw: number,
    ): WatchTransfer | undefined => {
      if (!transferEnabled) return undefined;
      const coin = row.coin;
      const b = bTransfer[coin];
      const g = gTransfer[coin];
      if (!b || !g) return undefined;

      const mode = direction;
      const sender = mode === "b2g" ? b : g;
      const receiver = mode === "b2g" ? g : b;
      const senderExchange = mode === "b2g" ? domesticExchange : overseasExchange;
      const receiverExchange = mode === "b2g" ? overseasExchange : domesticExchange;

      // 거래소별 출금/입금 가능 체인 필터링
      const senderWithdrawChains = (sender.chainInfo ?? []).filter((c: any) => c?.withdrawOk === true).map((c: any) => c.name);
      const receiverDepositChains = (receiver.chainInfo ?? []).filter((c: any) => c?.depositOk === true).map((c: any) => c.name);

      // 닫힌 이유 판단
      let closedReason: string | undefined;
      const senderName = senderExchange === "bithumb" ? "빗썸" : senderExchange === "upbit" ? "업비트" : senderExchange === "gateio" ? "게이트" : senderExchange === "bybit" ? "바이빗" : senderExchange === "okx" ? "OKX" : senderExchange;
      const receiverName = receiverExchange === "bithumb" ? "빗썸" : receiverExchange === "upbit" ? "업비트" : receiverExchange === "gateio" ? "게이트" : receiverExchange === "bybit" ? "바이빗" : receiverExchange === "okx" ? "OKX" : receiverExchange;

      if (senderWithdrawChains.length === 0 && receiverDepositChains.length === 0) {
        closedReason = `${senderName} 출금·${receiverName} 입금 중단`;
      } else if (senderWithdrawChains.length === 0) {
        closedReason = `${senderName} 출금 중단`;
      } else if (receiverDepositChains.length === 0) {
        closedReason = `${receiverName} 입금 중단`;
      } else {
        // 양쪽 다 열려있지만 공통 체인이 없는지 확인
        const pairs = commonChainPairs(senderWithdrawChains, receiverDepositChains);
        if (pairs.length === 0) {
          closedReason = `공통 체인 없음 (${senderName}: ${senderWithdrawChains.slice(0, 2).join(",")} / ${receiverName}: ${receiverDepositChains.slice(0, 2).join(",")})`;
        }
      }

      const pairs = commonChainPairs(senderWithdrawChains, receiverDepositChains);
      if (!pairs.length) return { direction: mode, chains: [], closedReason };

      const feeToKrw = (feeCoin: number): number | null => {
        // feeCoin이 0이면 무료 출금이므로 0 리턴 (유효한 값)
        if (!Number.isFinite(feeCoin) || feeCoin < 0) return null;
        if (feeCoin === 0) return 0;
        if (mode === "b2g") {
          if (!(row.overseasPriceUsdt > 0 && usdtKrw > 0)) return null;
          return feeCoin * row.overseasPriceUsdt * usdtKrw;
        }
        if (!(row.domesticPriceKrw > 0)) return null;
        return feeCoin * row.domesticPriceKrw;
      };

      const chains: WatchTransferChain[] = [];
      for (const [sChain, rChain] of pairs) {
        const info = (sender.chainInfo ?? []).find((x: any) => x?.name === sChain);
        const feeNum = info?.withdrawFee != null && Number.isFinite(Number(info.withdrawFee)) ? Number(info.withdrawFee) : null;
        const minNum = info?.withdrawMin != null && Number.isFinite(Number(info.withdrawMin)) ? Number(info.withdrawMin) : null;
        const feeKrw = feeNum != null ? feeToKrw(feeNum) : null;
        const minKrw = minNum != null ? feeToKrw(minNum) : null;
        chains.push({
          senderChain: sChain,
          receiverChain: rChain,
          feeCoin: feeNum,
          feeKrw,
          minCoin: minNum,
          minKrw,
        });
      }

      return { direction: mode, chains };
    };

    const evaluateTransfer = (
      transfer: WatchTransfer | undefined,
      baseQty: number | null,
    ): { transferOk: boolean; feeKrw: number | null; feeCoin: number | null } => {
      // chains가 있으면 송금 가능한 경로가 존재함
      if (!transfer || !transfer.chains.length) return { transferOk: false, feeKrw: null, feeCoin: null };

      // baseQty 체크를 더 관대하게 - 없거나 유효하지 않아도 경로 존재하면 transferOk = true
      const hasValidQty = baseQty != null && Number.isFinite(baseQty) && baseQty > 0;

      // 먼저 유효한 fee 정보가 있는 체인 중 최적 체인 찾기
      let bestChain: WatchTransferChain | null = null;
      for (const chain of transfer.chains) {
        // fee가 null이면 건너뜀 (나중에 처리)
        if (chain.feeKrw == null || !Number.isFinite(chain.feeKrw)) continue;
        // minCoin 체크는 baseQty가 유효할 때만
        if (hasValidQty && chain.minCoin != null && baseQty < chain.minCoin) continue;
        if (!bestChain || chain.feeKrw < (bestChain.feeKrw ?? Infinity)) bestChain = chain;
      }

      // 유효한 fee 있는 체인이 있으면 그걸 사용
      if (bestChain && bestChain.feeKrw != null) {
        return { transferOk: true, feeKrw: bestChain.feeKrw, feeCoin: bestChain.feeCoin ?? null };
      }

      // fee 정보가 없는 체인이라도 존재하면 transferOk = true (fee는 unknown)
      // minCoin 체크를 통과하는 체인이 있는지 확인
      for (const chain of transfer.chains) {
        if (hasValidQty && chain.minCoin != null && baseQty < chain.minCoin) continue;
        // 이 체인은 사용 가능
        return { transferOk: true, feeKrw: null, feeCoin: null };
      }

      // 모든 체인이 minCoin 미달이면 false
      return { transferOk: false, feeKrw: null, feeCoin: null };
    };

    let printedHeader = false;

    let tick = 0;
    let lastRate = initialRate;
    let lastFallbackTick = 0;
    const fallbackEveryTicks = Math.max(1, Math.round(5 / intervalSec));
    while (!signal?.aborted) {
      tick += 1;

      // 5분마다 transfer status 갱신
      const nowMs = Date.now();
      if (nowMs - lastTransferRefreshMs >= TRANSFER_REFRESH_INTERVAL_MS) {
        try {
          const [newBTransfer, newGTransfer] = await Promise.all([fetchDomesticTransfer(), fetchOverseasTransfer()]);
          bTransfer = newBTransfer;
          gTransfer = newGTransfer;
          lastTransferRefreshMs = nowMs;
          if (!silent) console.info(`[WATCH] Transfer status refreshed`);
          emitStatus({ phase: "transfer", message: "Transfer status refreshed" });
        } catch (err) {
          console.warn(`[WATCH] Transfer refresh failed: ${String(err)}`);
        }
      }

      try {
        const rate = await usdtKrwRateContext(rateSource);
        lastRate = rate;
      } catch (err) {
        console.warn(`[WATCH] rate fetch failed (using last rate): ${String(err)}`);
      }

      try {
        let freshRows: SnapshotRow[] = [];
        if (wsClients) {
          freshRows = buildRowsFromWsQuotes(lastRate.usdtKrw);
          if (tick % 10 === 0) console.info(`[WATCH] tick=${tick}, wsRows=${freshRows.length}, wsOnly=${wsOnly}, lastFallback=${lastFallbackTick}`);
          if (!freshRows.length && !wsOnly) {
            freshRows = await snapshotReverseRowsForCoins({
              domestic,
              gateSpot,
              gatePerp,
              symbolMaps,
              domesticFeeRate,
              overseasSpotFeeRate,
              overseasPerpFeeRate,
              coins: watchCoins,
              usdtKrw: lastRate.usdtKrw,
              concurrency,
              pricingMode: "ticker",
              notionalKrw,
            });
          } else if (!wsOnly && tick - lastFallbackTick >= fallbackEveryTicks) {
            // Consider coins "complete" if they have spot bid data in freshRows OR in lastByCoin (from previous REST)
            const completeSet = new Set<string>();
            for (const row of freshRows) {
              if (row.gateioSpotBid != null && row.gateioSpotBid > 0) completeSet.add(row.coin);
            }
            // Also check lastByCoin for previously fetched complete data
            for (const coin of watchCoins) {
              const cached = lastByCoin[coin];
              if (cached?.gateioSpotBid != null && cached.gateioSpotBid > 0) completeSet.add(coin);
            }
            const missingCoins = watchCoins.filter((coin) => !completeSet.has(coin));
            console.info(`[WATCH] REST fallback: tick=${tick}, wsRows=${freshRows.length}, complete=${completeSet.size}, missing=${missingCoins.length}`);
            if (missingCoins.length) {
              const restRows = await snapshotReverseRowsForCoins({
                domestic,
                gateSpot,
                gatePerp,
                symbolMaps,
                domesticFeeRate,
                overseasSpotFeeRate,
                overseasPerpFeeRate,
                coins: missingCoins,
                usdtKrw: lastRate.usdtKrw,
                concurrency,
                pricingMode: "ticker",
                notionalKrw,
              });
              console.info(`[WATCH] REST fetched: ${restRows.length} rows for ${missingCoins.length} coins`);
              freshRows = [...freshRows, ...restRows];
              lastFallbackTick = tick;
            }
          }
        } else {
          if (!wsOnly) {
            freshRows = await snapshotReverseRowsForCoins({
              domestic,
              gateSpot,
              gatePerp,
              symbolMaps,
              domesticFeeRate,
              overseasSpotFeeRate,
              overseasPerpFeeRate,
              coins: watchCoins,
              usdtKrw: lastRate.usdtKrw,
              concurrency,
              pricingMode: "ticker",
              notionalKrw,
            });
          } else {
            emitStatus({ phase: "error", message: "WebSocket-only mode requires active WS feeds." });
          }
        }
        // Only update lastByCoin if:
        // 1. New row has complete spot data, OR
        // 2. No existing data for this coin
        // This prevents WS rows without spot data from overwriting complete REST data
        for (const row of freshRows) {
          const hasCompleteData = row.gateioSpotBid != null && row.gateioSpotBid > 0;
          const existingRow = lastByCoin[row.coin];
          const existingHasCompleteData = existingRow?.gateioSpotBid != null && existingRow.gateioSpotBid > 0;
          // Update if new data is complete, or if existing data is also incomplete (use fresher prices)
          if (hasCompleteData || !existingHasCompleteData) {
            lastByCoin[row.coin] = row;
          }
        }

        const rows = watchCoins
          .map((coin) => lastByCoin[coin] ?? null)
          .filter((row): row is SnapshotRow => Boolean(row));

        const now = new Date().toLocaleTimeString();
        const outputRows: WatchReverseRow[] = [];

        const buildRow = (
          idx: number,
          row: SnapshotRow | null,
          includeTransfer: boolean,
          direction: "b2g" | "g2b",
        ): WatchReverseRow => {
          if (!row) return { rank: idx, coin: "N/A", missing: true };
          let pricing = selectPricing(row, direction);
          // If selectPricing fails (e.g., high basis), try to compute data anyway for display
          if (!pricing && direction === "b2g") {
            const hasSpotBid = row.gateioSpotBid != null && row.gateioSpotBid > 0;
            const hasPerpBid = row.overseasBid > 0;
            const hasDomesticAsk = row.domesticAsk > 0;
            // If we have all required data but selectPricing failed (likely high basis), still show data
            if (hasSpotBid && hasPerpBid && hasDomesticAsk) {
              pricing = { domesticPrice: row.domesticAsk, overseasPrice: row.gateioSpotBid as number, gapSource: "spot", useUnwind: false };
            }
          }
          if (!pricing) return { rank: idx, coin: row.coin, missing: true };

          const { domesticPrice, overseasPrice, gapSource, useUnwind } = pricing;
          const premium = premiumPct(domesticPrice, overseasPrice, lastRate.usdtKrw);

          let baseQty: number | null = null;
          let edgeKrw = 0;
          if (useUnwind) {
            baseQty = notionalKrw / (overseasPrice * lastRate.usdtKrw);
            const domesticKrw = baseQty * domesticPrice;
            edgeKrw = domesticKrw - notionalKrw;
          } else {
            baseQty = notionalKrw / domesticPrice;
            const overseasKrw = baseQty * overseasPrice * lastRate.usdtKrw;
            edgeKrw = overseasKrw - notionalKrw;
          }
          const edgePct = (edgeKrw / notionalKrw) * 100.0;

          const transfer = includeTransfer
            ? transferInfoForRow(
                direction,
                { coin: row.coin, domesticPriceKrw: domesticPrice, overseasPriceUsdt: overseasPrice },
                lastRate.usdtKrw,
              )
            : undefined;
          const transferEval = includeTransfer ? evaluateTransfer(transfer, baseQty) : { transferOk: false, feeKrw: null, feeCoin: null };
          const netEdgeKrw = transferEval.feeKrw != null ? edgeKrw - transferEval.feeKrw : undefined;
          const netEdgePct = netEdgeKrw != null ? (netEdgeKrw / notionalKrw) * 100.0 : undefined;

          const transferClosedReason = includeTransfer && !transferEval.transferOk ? transfer?.closedReason : undefined;
          return {
            rank: idx,
            direction,
            coin: row.coin,
            domesticExchange,
            overseasExchange,
            premiumPct: premium,
            edgeKrw,
            edgePct,
            netEdgeKrw,
            netEdgePct,
            transferOk: includeTransfer ? transferEval.transferOk : undefined,
            outTransferClosedReason: transferClosedReason, // B2G/G2B는 단일 경로이므로 outTransferClosedReason 사용
            domesticAsk: domesticPrice,
            overseasBid: overseasPrice,
            gapSource,
            gateioSpotAsk: row.gateioSpotAsk,
            gateioSpotBid: row.gateioSpotBid,
            gateioSpotSellUsdt: row.gateioSpotSellUsdt,
            spotVsPerpPct: row.spotVsPerpPct,
            impact: {
              domestic: row.liquidity?.domestic?.impactPct,
              gateioSpot: row.liquidity?.gateioSpot?.impactPct,
              gateioPerp: row.liquidity?.gateioPerp?.impactPct,
            },
            transfer,
            transferText: includeTransfer && transfer ? formatTransferInfoText(transfer, row.coin) : undefined,
          };
        };

        const b2gCandidates = rows
          .map((row) => {
            const pricing = selectPricing(row, "b2g");
            if (!pricing) return null;
            const premium = premiumPct(pricing.domesticPrice, pricing.overseasPrice, lastRate.usdtKrw);
            if (!(premium < 0)) return null;
            return { row, premium };
          })
          .filter((entry): entry is { row: SnapshotRow; premium: number } => Boolean(entry))
          .sort((a, b) => sortPremiumAsc({ premiumPct: a.premium, coin: a.row.coin }, { premiumPct: b.premium, coin: b.row.coin }));
        const g2bCandidates = rows
          .map((row) => {
            if (!(row.domesticBid && row.domesticBid > 0)) return null;
            if (!(row.gateioSpotAsk && row.gateioSpotAsk > 0)) return null;
            if (!(row.overseasBid && row.overseasBid > 0)) return null;
            const basis = basisPct(row.gateioSpotAsk, row.overseasBid);
            if (!(basis <= DEFAULT_G2B_BASIS_MAX_PCT)) return null;
            const premium = premiumPct(row.domesticBid, row.gateioSpotAsk, lastRate.usdtKrw);
            if (!(premium > 0)) return null;
            return { row, premium };
          })
          .filter((entry): entry is { row: SnapshotRow; premium: number } => Boolean(entry))
          .sort((a, b) => sortPremiumDesc({ premiumPct: a.premium, coin: a.row.coin }, { premiumPct: b.premium, coin: b.row.coin }));

        closestCoins = b2gCandidates.slice(0, Math.min(displayTopK, b2gCandidates.length)).map((entry) => entry.row.coin);
        farCoins = g2bCandidates.slice(0, Math.min(displayFarK, g2bCandidates.length)).map((entry) => entry.row.coin);

        const topB2G = b2gCandidates.slice(0, displayTopK);
        const topG2B = g2bCandidates.slice(0, displayFarK);
        const cycleLegLimit = Math.min(DEFAULT_CYCLE_LEG_LIMIT, Math.max(topN, displayTopK, displayFarK));
        const includeTransfer = transferEnabled;

        const cycleOutCandidates = rows
          .map((row) => {
            if (!(row.domesticAsk > 0 && row.gateioSpotBid != null && row.gateioSpotBid > 0)) return null;
            if (!(row.overseasBid > 0)) return null;
            const basisOut = basisPct(row.gateioSpotBid, row.overseasBid);
            if (basisOut > DEFAULT_B2G_BASIS_MAX_PCT) return null;
            const baseQty = notionalKrw / row.domesticAsk;
            const transferOut = includeTransfer
              ? transferInfoForRow(
                  "b2g",
                  { coin: row.coin, domesticPriceKrw: row.domesticAsk, overseasPriceUsdt: row.gateioSpotBid },
                  lastRate.usdtKrw,
                )
              : undefined;
            const transferEval = includeTransfer
              ? evaluateTransfer(transferOut, baseQty)
              : { transferOk: false, feeKrw: null, feeCoin: null };
            // 필터링 제거: transfer 닫혀있어도 빨간색으로 표시하며 보여줌
            const usdtOut = baseQty * row.gateioSpotBid;
            return {
              coin: row.coin,
              domesticAsk: row.domesticAsk,
              overseasSpotBid: row.gateioSpotBid,
              spotVsPerpPct: row.spotVsPerpPct,
              transfer: transferOut,
              transferEval,
              baseQty,
              usdtOut,
              impact: row.liquidity,
            };
          })
          .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
          .sort((a, b) => b.usdtOut - a.usdtOut);

        const cycleBackCandidates = rows
          .map((row) => {
            if (!(row.domesticBid && row.domesticBid > 0)) return null;
            if (!(row.gateioSpotAsk && row.gateioSpotAsk > 0)) return null;
            if (!(row.overseasBid && row.overseasBid > 0)) return null;
            const basisBack = basisPct(row.gateioSpotAsk, row.overseasBid);
            if (basisBack > DEFAULT_G2B_BASIS_MAX_PCT) return null;
            const krwPerUsdt = row.domesticBid / row.gateioSpotAsk;
            const transferBack = includeTransfer
              ? transferInfoForRow(
                  "g2b",
                  { coin: row.coin, domesticPriceKrw: row.domesticBid, overseasPriceUsdt: row.gateioSpotAsk },
                  lastRate.usdtKrw,
                )
              : undefined;
            return {
              coin: row.coin,
              domesticBid: row.domesticBid,
              overseasSpotAsk: row.gateioSpotAsk,
              spotVsPerpPct: row.spotVsPerpPct,
              krwPerUsdt,
              transfer: transferBack,
              impact: row.liquidity,
            };
          })
          .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
          .sort((a, b) => b.krwPerUsdt - a.krwPerUsdt);

        if (fullUniverse) {
          const cycleRows: WatchReverseRow[] = [];
          const outLegs = cycleOutCandidates.slice(0, cycleLegLimit);
          const backLegs = cycleBackCandidates.slice(0, cycleLegLimit);

          for (const out of outLegs) {
            for (const back of backLegs) {
              const baseQtyBack = out.usdtOut / back.overseasSpotAsk;
              if (!(baseQtyBack > 0)) continue;
              const backEval = includeTransfer
                ? evaluateTransfer(back.transfer, baseQtyBack)
                : { transferOk: false, feeKrw: null, feeCoin: null };
              // 필터링 제거: transfer 닫혀있어도 빨간색으로 표시하며 보여줌

              const grossKrw = baseQtyBack * back.domesticBid;
              const edgeKrw = grossKrw - notionalKrw;
              const edgePct = (edgeKrw / notionalKrw) * 100.0;
              const feeOutKrw = includeTransfer ? (out.transferEval.feeKrw ?? 0) : 0;
              const feeBackKrw = includeTransfer ? (backEval.feeKrw ?? 0) : 0;
              const netEdgeKrw =
                includeTransfer && (out.transferEval.feeKrw != null || backEval.feeKrw != null)
                  ? edgeKrw - feeOutKrw - feeBackKrw
                  : undefined;
              const netEdgePct = netEdgeKrw != null ? (netEdgeKrw / notionalKrw) * 100.0 : undefined;
              const outTransferOk = includeTransfer ? out.transferEval.transferOk : undefined;
              const backTransferOk = includeTransfer ? backEval.transferOk : undefined;
              const transferOk = includeTransfer ? outTransferOk && backTransferOk : undefined;
              const outTransferClosedReason = includeTransfer && !outTransferOk ? out.transfer?.closedReason : undefined;
              const backTransferClosedReason = includeTransfer && !backTransferOk ? back.transfer?.closedReason : undefined;
              const coinLabel = out.coin === back.coin ? out.coin : `${out.coin}→${back.coin}`;

              cycleRows.push({
                rank: 0,
              cycle: true,
              coin: coinLabel,
              outCoin: out.coin,
              backCoin: back.coin,
              domesticExchange,
              overseasExchange,
              premiumPct: netEdgePct ?? edgePct,
              edgeKrw,
              edgePct,
              netEdgeKrw,
                netEdgePct,
                transferOk,
                outTransferOk,
                backTransferOk,
                outTransferClosedReason,
                backTransferClosedReason,
                domesticAsk: out.domesticAsk,
                domesticBid: back.domesticBid,
                gateioSpotBid: out.overseasSpotBid,
                gateioSpotAsk: back.overseasSpotAsk,
                outDomesticAsk: out.domesticAsk,
                outOverseasBid: out.overseasSpotBid,
                backOverseasAsk: back.overseasSpotAsk,
                backDomesticBid: back.domesticBid,
                outSpotVsPerpPct: out.spotVsPerpPct,
                backSpotVsPerpPct: back.spotVsPerpPct,
                impact: {
                  domestic: out.impact?.domestic?.impactPct,
                  gateioSpot: out.impact?.gateioSpot?.impactPct,
                  gateioPerp: out.impact?.gateioPerp?.impactPct,
                },
                transferOut: out.transfer,
                transferBack: back.transfer,
              });
            }
          }

          // 필터링 제거: transfer 닫혀있어도 빨간색으로 표시하며 보여줌
          const filteredCycleRows = cycleRows;

          filteredCycleRows.sort((a, b) => {
            const aEdge = transferEnabled ? (a.netEdgeKrw ?? -Infinity) : (a.edgeKrw ?? -Infinity);
            const bEdge = transferEnabled ? (b.netEdgeKrw ?? -Infinity) : (b.edgeKrw ?? -Infinity);
            const edgeDiff = bEdge - aEdge;
            if (edgeDiff !== 0) return edgeDiff;
            const aPct = transferEnabled ? (a.netEdgePct ?? -Infinity) : (a.edgePct ?? -Infinity);
            const bPct = transferEnabled ? (b.netEdgePct ?? -Infinity) : (b.edgePct ?? -Infinity);
            const pctDiff = bPct - aPct;
            if (pctDiff !== 0) return pctDiff;
            return a.coin.localeCompare(b.coin);
          });

          filteredCycleRows.forEach((row, idx) => {
            row.rank = idx + 1;
          });
          outputRows.push(...filteredCycleRows);

          // Also add individual B2G/G2B routes for full universe mode
          let individualIdx = filteredCycleRows.length;
          for (const entry of b2gCandidates.slice(0, displayTopK)) {
            outputRows.push(buildRow((individualIdx += 1), entry.row, true, "b2g"));
          }
          for (const entry of g2bCandidates.slice(0, displayFarK)) {
            outputRows.push(buildRow((individualIdx += 1), entry.row, true, "g2b"));
          }
        } else {
          let outIdx = 0;
          for (const entry of topB2G) outputRows.push(buildRow((outIdx += 1), entry.row, true, "b2g"));
          for (const entry of topG2B) outputRows.push(buildRow((outIdx += 1), entry.row, true, "g2b"));

          const remainingSlots = Math.max(0, topN - outIdx);
          if (remainingSlots > 0) {
            const extras = [
              ...b2gCandidates.slice(displayTopK).map((entry) => ({ entry, direction: "b2g" as const })),
              ...g2bCandidates.slice(displayFarK).map((entry) => ({ entry, direction: "g2b" as const })),
            ];
            for (const extra of extras) {
              if (outIdx >= topN) break;
              outputRows.push(buildRow((outIdx += 1), extra.entry.row, true, extra.direction));
            }
          }
        }

        const allRows: WatchReverseRow[] = [];
        let allIdx = 0;
        const allCandidates = rows.map((row) => {
          const pricing = selectPricing(row, "b2g");
          if (!pricing) return { row, premium: null };
          return { row, premium: premiumPct(pricing.domesticPrice, pricing.overseasPrice, lastRate.usdtKrw) };
        });
        const withPremium = allCandidates
          .filter((entry): entry is { row: SnapshotRow; premium: number } => entry.premium != null)
          .sort((a, b) => sortPremiumAsc({ premiumPct: a.premium, coin: a.row.coin }, { premiumPct: b.premium, coin: b.row.coin }));
        const withoutPremium = allCandidates.filter((entry) => entry.premium == null).map((entry) => entry.row);
        const allSorted = [...withPremium.map((entry) => entry.row), ...withoutPremium];
        const seen = new Set<string>();
        for (const row of allSorted) {
          allRows.push(buildRow((allIdx += 1), row, false, "b2g"));
          seen.add(row.coin);
        }
        for (const coin of watchCoins) {
          if (seen.has(coin)) continue;
          allRows.push(buildRow((allIdx += 1), lastByCoin[coin] ?? null, false, "b2g"));
        }

        const payload: WatchReverseTick = {
          tick,
          time: now,
          rate: {
            label: lastRate.label,
            usdtKrw: lastRate.usdtKrw,
            usdtPremiumPct: lastRate.usdtPremiumPct ?? null,
            premiumSource: lastRate.premiumSource ?? null,
            fxUsdKrw: lastRate.fxUsdKrw ?? null,
            domesticUsdtKrw: lastRate.domesticUsdtKrw ?? null,
          },
          config,
          watchCoins,
          closeCoins: closestCoins,
          farCoins,
          rows: outputRows,
          allRows,
        };

        if (onTick) {
          try {
            onTick(payload);
          } catch (err) {
            console.warn(`[WATCH] onTick failed: ${String(err)}`);
          }
        }
        emitStatus({ phase: "tick", message: `tick ${tick}` });

        if (!silent) {
          if (!printedHeader) {
            const listLabel = fullUniverse ? "전체 리스트" : "고정 리스트";
            console.info(
              `\n[WATCH] ${listLabel} ${watchCoins.length}개, ${intervalSec}초마다 업데이트 (가까운 ${displayTopK} + 큰차이 ${displayFarK})`,
            );
            console.info(
              `[WATCH] 기준금액=${formatKrw(notionalKrw)} | ticker(best bid/ask) | B→G: 국내 ask / 해외 spot bid + basis<=${DEFAULT_B2G_BASIS_MAX_PCT}% | G→B: 국내 bid / 해외 spot ask(없으면 perp)`,
            );
            console.info(`b2g=${closestCoins.join(", ")}`);
            if (farCoins.length) console.info(`g2b=${farCoins.join(", ")}`);
            console.info("중지: Ctrl+C");
            printedHeader = true;
          }

          console.info(
            `\n[WATCH] tick=${tick} @ ${now} | USDT/KRW (${lastRate.label})=${Math.round(lastRate.usdtKrw).toLocaleString()}`,
          );
          if (lastRate.usdtPremiumPct != null && lastRate.fxUsdKrw != null && lastRate.domesticUsdtKrw != null) {
            console.info(
              `USDT premium vs FX (${lastRate.premiumSource ?? "domestic"}): ${lastRate.usdtPremiumPct >= 0 ? "+" : ""}${lastRate.usdtPremiumPct.toFixed(2)}%`,
            );
          }

          for (const row of outputRows) {
            if (row.missing || !row.domesticAsk || !row.overseasBid) {
              console.info(`${String(row.rank).padStart(2, " ")} ) ${row.coin.padEnd(10)} (가격 없음)`);
              continue;
            }
            const premiumPct = row.premiumPct ?? 0;
            const edgeKrw = row.edgeKrw ?? 0;
            const edgePct = row.edgePct ?? 0;
            const netEdgeKrw = row.netEdgeKrw;
            const netEdgePct = row.netEdgePct;
            const edgeLabel = netEdgeKrw != null && netEdgePct != null ? "net_edge" : "edge";
            const edgeValueKrw = netEdgeKrw ?? edgeKrw;
            const edgeValuePct = netEdgePct ?? edgePct;
            const domesticAsk = row.domesticAsk;
            const overseasBid = row.overseasBid;
            if (row.cycle) {
              const outCoin = row.outCoin ?? row.coin;
              const backCoin = row.backCoin ?? row.coin;
              const outAsk = row.outDomesticAsk ?? row.domesticAsk;
              const backBid = row.backDomesticBid ?? row.domesticBid;
              const outSpotBid = row.outOverseasBid ?? row.gateioSpotBid;
              const backSpotAsk = row.backOverseasAsk ?? row.gateioSpotAsk;
              console.info(
                `${String(row.rank).padStart(2, " ")} ) ${row.coin.padEnd(14)} ${premiumPct >= 0 ? "+" : ""}${premiumPct.toFixed(3)}% | ${edgeLabel}=${edgeValueKrw >= 0 ? "+" : ""}${Math.round(edgeValueKrw).toLocaleString()}원 (${edgeValuePct >= 0 ? "+" : ""}${edgeValuePct.toFixed(3)}%) | ${domesticLabel} ${outCoin} ask=${outAsk != null ? Math.round(outAsk).toLocaleString() : "—"} KRW | ${overseasLabel.toUpperCase()} ${outCoin} spot_bid=${formatUsdtPrice(outSpotBid ?? 0)} | ${overseasLabel.toUpperCase()} ${backCoin} spot_ask=${formatUsdtPrice(backSpotAsk ?? 0)} | ${domesticLabel} ${backCoin} bid=${backBid != null ? Math.round(backBid).toLocaleString() : "—"} KRW${row.transferText ?? ""}`,
              );
              continue;
            }

            const direction = row.direction === "g2b" ? "g2b" : "b2g";
            const domesticPriceLabel = direction === "g2b" ? `${domesticLabel} bid` : `${domesticLabel} ask`;
            const overseasSideLabel =
              direction === "g2b"
                ? row.gapSource === "spot"
                  ? `${overseasLabel.toUpperCase()} spot_ask`
                  : `${overseasLabel.toUpperCase()} perp_ask`
                : row.gapSource === "spot"
                  ? `${overseasLabel.toUpperCase()} spot_bid`
                  : `${overseasLabel.toUpperCase()} perp_bid`;
            const bImp = row.impact?.domestic;
            const sImp = row.impact?.gateioSpot;
            const pImp = row.impact?.gateioPerp;
            const liq =
              bImp != null && pImp != null
                ? ` | imp(d/s/p)=${bImp.toFixed(3)}%/${sImp != null ? sImp.toFixed(3) : "n/a"}%/${pImp.toFixed(3)}%`
                : "";

            const spotInfo =
              direction === "g2b"
                ? row.gateioSpotAsk != null
                  ? ` | ${overseasLabel.toUpperCase()} spot_ask=${formatUsdtPrice(row.gateioSpotAsk)}`
                  : ""
                : row.gateioSpotBid != null && row.gateioSpotSellUsdt != null
                  ? row.gapSource === "spot"
                    ? ` | spot_sell≈${formatUsdtAmount(row.gateioSpotSellUsdt)}`
                    : ` | ${overseasLabel.toUpperCase()} spot_bid=${formatUsdtPrice(row.gateioSpotBid)} (sell≈${formatUsdtAmount(row.gateioSpotSellUsdt)})`
                  : "";
            const spotVsPerp =
              row.spotVsPerpPct != null
                ? ` | perp_vs_spot=${row.spotVsPerpPct >= 0 ? "+" : ""}${row.spotVsPerpPct.toFixed(3)}%`
                : "";

            console.info(
              `${String(row.rank).padStart(2, " ")} ) ${row.coin.padEnd(10)} ${premiumPct >= 0 ? "+" : ""}${premiumPct.toFixed(3)}% | ${edgeLabel}=${edgeValueKrw >= 0 ? "+" : ""}${Math.round(edgeValueKrw).toLocaleString()}원 (${edgeValuePct >= 0 ? "+" : ""}${edgeValuePct.toFixed(3)}%) | ${domesticPriceLabel}=${Math.round(domesticAsk).toLocaleString()} KRW | ${overseasSideLabel}=${formatUsdtPrice(overseasBid)}${spotInfo}${spotVsPerp}${liq}${row.transferText ?? ""}`,
            );
          }
        }
      } catch (err) {
        console.warn(`[WATCH] tick failed: ${String(err)}`);
        emitStatus({ phase: "error", message: `tick failed: ${String(err)}` });
      }

      await sleepWithSignal(intervalSec * 1000, signal);
    }
  } finally {
    emitStatus({ phase: "stopped", message: "watch stopped" });
    if (ownsDomesticWs) wsClients?.domestic.close();
    if (ownsGatePerpWs) wsClients?.gatePerp.close();
    if (ownsGateSpotWs) wsClients?.gateSpot?.close();
    await domestic.close?.();
    if (ownsGateSpot) await gateSpot?.close?.();
    if (ownsGatePerp) await gatePerp?.close?.();
  }
}

/**
 * B2G 사이클: 빗썸 → 해외 자금 이동
 * - 김프 0%에 가까운 코인 선택 (손실 최소화)
 * - 빗썸 현물 매수 + GateIO 선물 숏 (헷지)
 * - 코인 전송 후 현물 매도 + 숏 청산
 */
export async function runReverseCycle(
  chunkUsdt: number,
  nearZeroMaxAbsPct: number,
  basisThresholdPct: number,
  maxChunks: number,
  confirmLive: ConfirmFunc,
  confirmTransfer: TransferConfirmFunc,
  orderbookDepth = DEFAULT_ORDERBOOK_DEPTH,
  options?: { entryTopN?: number },
) {
  const bithumb = await createBithumb(true);
  const gateSpot = await createGateioSpot(true, false);
  const gatePerp = await createGateioPerp(true, false);

  const rateSource = usdtKrwRateSource();
  const rate = await usdtKrwRateContext(rateSource);
  const usdtKrw = rate.usdtKrw;
  console.info(`USDT/KRW (${rate.label}): ${Math.round(usdtKrw).toLocaleString()}`);
  if (rate.usdtPremiumPct != null && rate.fxUsdKrw != null && rate.domesticUsdtKrw != null) {
    console.info(
      `USDT premium vs FX (${rate.premiumSource ?? "domestic"}): ${rate.usdtPremiumPct >= 0 ? "+" : ""}${rate.usdtPremiumPct.toFixed(2)}% (FX=${Math.round(rate.fxUsdKrw).toLocaleString()}, KRW-USDT=${Math.round(rate.domesticUsdtKrw).toLocaleString()})`,
    );
  }

  const universe = await getArbitrageSymbolUniverse(bithumb, gateSpot, gatePerp);
  const candidates = universe.reverseCandidates;
  if (!candidates.length) throw new Error("No overlapping Bithumb(KRW) / GateIO(perp) coins found.");

  const bithumbQuotes = await fetchQuotesByBase(bithumb, Object.fromEntries(candidates.map((c) => [c, universe.bithumbKrwSymbols[c] ?? ""]).filter(([, v]) => v)));
  const gateioPerpQuotes = await fetchQuotesByBase(gatePerp, Object.fromEntries(candidates.map((c) => [c, universe.gateioPerpSymbols[c] ?? ""]).filter(([, v]) => v)));

  const prefilter = computeNearZeroOpportunities(
    applyFeeToQuotes(bithumbQuotes, BITHUMB_SPOT_TAKER_FEE, BITHUMB_SPOT_TAKER_FEE),
    applyFeeToQuotes(gateioPerpQuotes, GATEIO_PERP_TAKER_FEE, GATEIO_PERP_TAKER_FEE),
    usdtKrw,
    nearZeroMaxAbsPct,
  );
  const prefilterCoins = prefilter.map((o) => o.coin);
  if (!prefilterCoins.length) throw new Error("No near-zero premium candidate passes the threshold.");

  const perpRawQuotes: Record<string, MarketQuote> = {};
  const baseQtyByCoin: Record<string, number> = {};
  for (const coin of prefilterCoins) {
    const symbol = universe.gateioPerpSymbols[coin];
    if (!symbol) continue;
    const result = await quoteAndSizeFromNotional(gatePerp, symbol, chunkUsdt, "sell", orderbookDepth);
    if (!result) continue;
    perpRawQuotes[coin] = result.quote;
    baseQtyByCoin[coin] = result.baseQty;
  }

  const bithumbRawQuotes = await fetchVwapQuotesByBase(
    bithumb,
    Object.fromEntries(Object.keys(baseQtyByCoin).map((c) => [c, universe.bithumbKrwSymbols[c] ?? ""]).filter(([, v]) => v)),
    baseQtyByCoin,
    orderbookDepth,
  );
  const gateioSpotRawQuotes = await fetchVwapQuotesByBase(
    gateSpot,
    Object.fromEntries(Object.keys(baseQtyByCoin).filter((c) => universe.gateioSpotSymbols[c]).map((c) => [c, universe.gateioSpotSymbols[c] ?? ""]).filter(([, v]) => v)),
    baseQtyByCoin,
    orderbookDepth,
  );

  const bithumbEff = applyFeeToQuotes(bithumbRawQuotes, BITHUMB_SPOT_TAKER_FEE, BITHUMB_SPOT_TAKER_FEE);
  const perpEff = applyFeeToQuotes(perpRawQuotes, GATEIO_PERP_TAKER_FEE, GATEIO_PERP_TAKER_FEE);
  const gateSpotEff = applyFeeToQuotes(gateioSpotRawQuotes, GATEIO_SPOT_TAKER_FEE, GATEIO_SPOT_TAKER_FEE);

  const opps = computeNearZeroOpportunities(bithumbEff, perpEff, usdtKrw, nearZeroMaxAbsPct);
  console.info(`\n[1] B2G 후보 (김프 0% 근접, VWAP 기준) – 상위 ${Math.min(15, opps.length)}개`);
  showTop(opps, 15);

  const entryTopN = Math.max(0, Math.trunc(options?.entryTopN ?? 10));
  const topRows: Array<{
    coin: string;
    premiumPct: number;
    domesticAsk: number;
    overseasBid: number;
  }> = [];

  for (const coin of Object.keys(bithumbEff)) {
    const b = bithumbEff[coin];
    const p = perpEff[coin];
    if (!b || !p) continue;
    if (!(b.ask > 0 && p.bid > 0)) continue;
    topRows.push({ coin, premiumPct: premiumPct(b.ask, p.bid, usdtKrw), domesticAsk: b.ask, overseasBid: p.bid });
  }
  topRows.sort(sortReversePreferred);
  const topCoins = entryTopN > 0 ? topRows.slice(0, entryTopN).map((r) => r.coin) : topRows.map((r) => r.coin);
  const entryOpps = topCoins.map((coin) => {
    const b = bithumbEff[coin];
    const p = perpEff[coin];
    if (!b || !p) return null;
    return {
      coin,
      direction: "reverse" as const,
      premiumPct: premiumPct(b.ask, p.bid, usdtKrw),
      domesticPrice: b.ask,
      overseasPrice: p.bid,
      usdtKrw,
    };
  }).filter((x): x is NonNullable<typeof x> => x !== null);

  console.info(
    `\n[1] 진입 후보 제한: TOP ${entryTopN > 0 ? entryTopN : "ALL"} (0% 근접/역프 우선)`,
  );
  for (const [idx, row] of topRows.slice(0, Math.min(10, topRows.length)).entries()) {
    console.info(
      `${String(idx + 1).padStart(2, " ")} ) ${row.coin.padEnd(10)} ${row.premiumPct >= 0 ? "+" : ""}${row.premiumPct.toFixed(3)}% | BITHUMB ask=${Math.round(row.domesticAsk).toLocaleString()} | GATEIO bid=${row.overseasBid}`,
    );
  }

  const selected = await selectTransferableCandidateCoin(entryOpps, gateSpotEff, perpEff, gateSpot, basisThresholdPct, "unwind");
  if (!selected) throw new Error("No reverse-premium candidate satisfies GateIO basis + transfer constraints.");

  const { coin, bithumb: bStatus, gateio: gStatus, chainPairs } = selected;
  console.info(`\n선정 코인: ${coin}`);
  console.info(
    `Bithumb deposit: ${bStatus.depositOk} | withdraw: ${bStatus.withdrawOk} || GateIO deposit: ${gStatus.depositOk} | withdraw: ${gStatus.withdrawOk} || common chains: ${chainPairs.map(([b, g]) => `${b}↔${g}`).join(", ") || "N/A"}`,
  );
  logTransferEta(chainPairs, bStatus, gStatus, "bithumb_to_gateio");

  if (!(await confirmLive())) return;

  const bithumbSymbol = universe.bithumbKrwSymbols[coin];
  const gatePerpSymbol = universe.gateioPerpSymbols[coin];
  const gateSpotSymbol = universe.gateioSpotSymbols[coin];
  if (!bithumbSymbol || !gatePerpSymbol) throw new Error(`Missing symbol for ${coin}`);

  for (let idx = 1; idx <= maxChunks; idx++) {
    console.info(`\n[4] 진입 청크 ${idx}/${maxChunks} (${chunkUsdt} USDT)`);
    const perpResult = await quoteAndSizeFromNotional(gatePerp, gatePerpSymbol, chunkUsdt, "sell", orderbookDepth);
    if (!perpResult) throw new Error("Failed to size perp order from notional.");
    const { quote: perpRawQuote, baseQty } = perpResult;

    const bithumbRaw = await fetchVwapQuote(bithumb, bithumbSymbol, baseQty, orderbookDepth);
    if (!bithumbRaw) throw new Error("Failed to fetch Bithumb VWAP quote.");

    const bithumbFee = feeAdjustedQuote(bithumbRaw, BITHUMB_SPOT_TAKER_FEE, BITHUMB_SPOT_TAKER_FEE);
    const perpFee = feeAdjustedQuote(perpRawQuote, GATEIO_PERP_TAKER_FEE, GATEIO_PERP_TAKER_FEE);
    const currentPct = premiumPct(bithumbFee.ask, perpFee.bid, usdtKrw);
    console.info(`[4] 현재 김프 = ${currentPct >= 0 ? "+" : ""}${currentPct.toFixed(3)}% (허용범위: ±${nearZeroMaxAbsPct.toFixed(3)}%)`);
    if (Math.abs(currentPct) > nearZeroMaxAbsPct) {
      console.info("진입 조건 미충족 (0%에서 너무 벗어남): 스킵");
      continue;
    }

    const perpFilled = await gateioPerpShort(gatePerp, gatePerpSymbol, baseQty, coin);
    const spotFilled = await bithumbMarketBuyBase(bithumb, bithumbSymbol, perpFilled, coin);
    const diff = spotFilled - perpFilled;
    if (Math.abs(diff) > 1e-8) console.warn(`수량 불일치: bithumb=${spotFilled}, gateio_perp=${perpFilled} (diff=${diff})`);
  }

  const shortQty = await gateioPerpShortQty(gatePerp, coin);
  if (!(shortQty > 0)) throw new Error("No GateIO perp short position detected to unwind.");

  console.info(`\n[5] 이제 ${coin} 를 Bithumb -> GateIO 로 직접 전송하세요.`);
  if (!(await confirmTransfer(coin, "bithumb_to_gateio"))) return;

  const gateBal = await gateioSpotBalance(gateSpot, coin);
  const qty = Math.min(shortQty, gateBal || shortQty);
  console.info(`\n[6] 청산 수량: ${qty.toFixed(8)} ${coin} (short=${shortQty.toFixed(8)}, gate_spot_balance=${gateBal.toFixed(8)})`);

  const perpRaw = await fetchVwapQuote(gatePerp, gatePerpSymbol, qty, orderbookDepth);
  const spotRaw = gateSpotSymbol ? await fetchVwapQuote(gateSpot, gateSpotSymbol, qty, orderbookDepth) : null;
  if (!perpRaw || !spotRaw) throw new Error("Failed to fetch GateIO VWAP quotes for unwind.");

  const spotFee = feeAdjustedQuote(spotRaw, GATEIO_SPOT_TAKER_FEE, GATEIO_SPOT_TAKER_FEE);
  const perpFee = feeAdjustedQuote(perpRaw, GATEIO_PERP_TAKER_FEE, GATEIO_PERP_TAKER_FEE);
  const gap = basisPct(spotFee.bid, perpFee.ask);
  console.info(`[6] GateIO basis(unwind) = ${gap.toFixed(3)}% (threshold=${basisThresholdPct.toFixed(3)}%)`);
  if (gap > basisThresholdPct) throw new Error("GateIO basis too wide to unwind safely.");

  const covered = await gateioPerpCover(gatePerp, gatePerpSymbol, qty, coin);
  if (gateSpotSymbol) await gateioSpotSell(gateSpot, gateSpotSymbol, covered, coin);

  const krwBal = await bithumbSpotBalance(bithumb, "KRW");
  console.info(`\n✅ 완료. Bithumb KRW balance: ₩${Math.round(krwBal).toLocaleString()}`);
}

export async function runKimchiCycle(
  chunkUsdt: number,
  kimchiThresholdPct: number,
  basisThresholdPct: number,
  maxChunks: number,
  confirmLive: ConfirmFunc,
  confirmTransfer: TransferConfirmFunc,
  orderbookDepth = DEFAULT_ORDERBOOK_DEPTH,
) {
  const bithumb = await createBithumb(true);
  const gateSpot = await createGateioSpot(true, false);
  const gatePerp = await createGateioPerp(true, false);

  const rateSource = usdtKrwRateSource();
  const rate = await usdtKrwRateContext(rateSource);
  const usdtKrw = rate.usdtKrw;
  console.info(`USDT/KRW (${rate.label}): ${Math.round(usdtKrw).toLocaleString()}`);
  if (rate.usdtPremiumPct != null && rate.fxUsdKrw != null && rate.domesticUsdtKrw != null) {
    console.info(
      `USDT premium vs FX (${rate.premiumSource ?? "domestic"}): ${rate.usdtPremiumPct >= 0 ? "+" : ""}${rate.usdtPremiumPct.toFixed(2)}% (FX=${Math.round(rate.fxUsdKrw).toLocaleString()}, KRW-USDT=${Math.round(rate.domesticUsdtKrw).toLocaleString()})`,
    );
  }

  const universe = await getArbitrageSymbolUniverse(bithumb, gateSpot, gatePerp);
  const candidates = universe.kimchiCandidates;
  if (!candidates.length) throw new Error("No overlapping Bithumb(KRW) / GateIO(spot+perp) coins found.");

  const bithumbQuotes = await fetchQuotesByBase(bithumb, Object.fromEntries(candidates.map((c) => [c, universe.bithumbKrwSymbols[c] ?? ""]).filter(([, v]) => v)));
  const gateioPerpQuotes = await fetchQuotesByBase(gatePerp, Object.fromEntries(candidates.map((c) => [c, universe.gateioPerpSymbols[c] ?? ""]).filter(([, v]) => v)));

  const prefilter = computeKimchiOpportunities(
    applyFeeToQuotes(bithumbQuotes, BITHUMB_SPOT_TAKER_FEE, BITHUMB_SPOT_TAKER_FEE),
    applyFeeToQuotes(gateioPerpQuotes, GATEIO_PERP_TAKER_FEE, GATEIO_PERP_TAKER_FEE),
    usdtKrw,
    kimchiThresholdPct,
  );
  const prefilterCoins = prefilter.map((o) => o.coin);
  if (!prefilterCoins.length) throw new Error("No kimchi-premium candidate passes the threshold.");

  const perpRawQuotes: Record<string, MarketQuote> = {};
  const baseQtyByCoin: Record<string, number> = {};
  for (const coin of prefilterCoins) {
    const symbol = universe.gateioPerpSymbols[coin];
    if (!symbol) continue;
    const result = await quoteAndSizeFromNotional(gatePerp, symbol, chunkUsdt, "sell", orderbookDepth);
    if (!result) continue;
    perpRawQuotes[coin] = result.quote;
    baseQtyByCoin[coin] = result.baseQty;
  }

  const bithumbRawQuotes = await fetchVwapQuotesByBase(
    bithumb,
    Object.fromEntries(Object.keys(baseQtyByCoin).map((c) => [c, universe.bithumbKrwSymbols[c] ?? ""]).filter(([, v]) => v)),
    baseQtyByCoin,
    orderbookDepth,
  );
  const gateioSpotRawQuotes = await fetchVwapQuotesByBase(
    gateSpot,
    Object.fromEntries(Object.keys(baseQtyByCoin).filter((c) => universe.gateioSpotSymbols[c]).map((c) => [c, universe.gateioSpotSymbols[c] ?? ""]).filter(([, v]) => v)),
    baseQtyByCoin,
    orderbookDepth,
  );

  const bithumbEff = applyFeeToQuotes(bithumbRawQuotes, BITHUMB_SPOT_TAKER_FEE, BITHUMB_SPOT_TAKER_FEE);
  const perpEff = applyFeeToQuotes(perpRawQuotes, GATEIO_PERP_TAKER_FEE, GATEIO_PERP_TAKER_FEE);
  const gateSpotEff = applyFeeToQuotes(gateioSpotRawQuotes, GATEIO_SPOT_TAKER_FEE, GATEIO_SPOT_TAKER_FEE);

  const opps = computeKimchiOpportunities(bithumbEff, perpEff, usdtKrw, kimchiThresholdPct);
  console.info(`\n[1] 김프 후보 (VWAP 기준) – 상위 ${Math.min(15, opps.length)}개`);
  showTop(opps, 15);

  const selected = await selectTransferableCandidateCoin(opps, gateSpotEff, perpEff, gateSpot, basisThresholdPct, "entry");
  if (!selected) throw new Error("No kimchi-premium candidate satisfies GateIO basis + transfer constraints.");

  const { coin, bithumb: bStatus, gateio: gStatus, chainPairs } = selected;
  console.info(`\n선정 코인: ${coin}`);
  console.info(
    `Bithumb deposit: ${bStatus.depositOk} | withdraw: ${bStatus.withdrawOk} || GateIO deposit: ${gStatus.depositOk} | withdraw: ${gStatus.withdrawOk} || common chains: ${chainPairs.map(([b, g]) => `${b}↔${g}`).join(", ") || "N/A"}`,
  );
  logTransferEta(chainPairs, bStatus, gStatus, "gateio_to_bithumb");

  if (!(await confirmLive())) return;

  const bithumbSymbol = universe.bithumbKrwSymbols[coin];
  const gatePerpSymbol = universe.gateioPerpSymbols[coin];
  const gateSpotSymbol = universe.gateioSpotSymbols[coin];
  if (!bithumbSymbol || !gatePerpSymbol || !gateSpotSymbol) throw new Error(`Missing symbol for ${coin}`);

  for (let idx = 1; idx <= maxChunks; idx++) {
    console.info(`\n[4] 진입 청크 ${idx}/${maxChunks} (${chunkUsdt} USDT)`);
    const perpResult = await quoteAndSizeFromNotional(gatePerp, gatePerpSymbol, chunkUsdt, "sell", orderbookDepth);
    if (!perpResult) throw new Error("Failed to size perp order from notional.");
    const { quote: perpRawQuote, baseQty } = perpResult;

    const bithumbRaw = await fetchVwapQuote(bithumb, bithumbSymbol, baseQty, orderbookDepth);
    const gateSpotRaw = await fetchVwapQuote(gateSpot, gateSpotSymbol, baseQty, orderbookDepth);
    if (!bithumbRaw || !gateSpotRaw) throw new Error("Failed to fetch VWAP quotes.");

    const bithumbFee = feeAdjustedQuote(bithumbRaw, BITHUMB_SPOT_TAKER_FEE, BITHUMB_SPOT_TAKER_FEE);
    const gateSpotFee = feeAdjustedQuote(gateSpotRaw, GATEIO_SPOT_TAKER_FEE, GATEIO_SPOT_TAKER_FEE);
    const perpFee = feeAdjustedQuote(perpRawQuote, GATEIO_PERP_TAKER_FEE, GATEIO_PERP_TAKER_FEE);

    const currentPct = premiumPct(bithumbFee.bid, perpFee.ask, usdtKrw);
    console.info(`[4] 현재 김프(진입) = ${currentPct.toFixed(3)}% (threshold=${kimchiThresholdPct.toFixed(3)}%)`);
    if (currentPct < kimchiThresholdPct) {
      console.info("진입 조건 미충족: 스킵");
      continue;
    }

    const gap = basisPct(gateSpotFee.ask, perpFee.bid);
    if (gap > basisThresholdPct) {
      console.info(`GateIO basis too wide (${gap.toFixed(3)}%): 스킵`);
      continue;
    }

    const spotFilled = await gateioSpotBuy(gateSpot, gateSpotSymbol, baseQty, coin);
    await gateioPerpShort(gatePerp, gatePerpSymbol, spotFilled, coin);
  }

  console.info(`\n[10] 이제 ${coin} 를 GateIO -> Bithumb 로 직접 전송하세요.`);
  if (!(await confirmTransfer(coin, "gateio_to_bithumb"))) return;

  const bithumbBal = await bithumbSpotBalance(bithumb, coin);
  if (!(bithumbBal > 0)) throw new Error("No Bithumb spot balance detected to sell.");

  await bithumbMarketSellBase(bithumb, bithumbSymbol, bithumbBal, coin);

  const shortQty = await gateioPerpShortQty(gatePerp, coin);
  if (shortQty > 0) {
    console.info(`[11] GateIO perp short remaining: ${shortQty.toFixed(8)} ${coin} — covering with market buy.`);
    await gateioPerpCover(gatePerp, gatePerpSymbol, shortQty, coin);
  }
}
