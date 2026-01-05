import type { Exchange } from "ccxt";
import { applyFee } from "./calculations";
import { MarketQuote } from "./models";
import { estimateFillFromQuote, quoteFromOrderbook } from "./orderbook";

export async function fetchQuote(exchange: Exchange, symbol: string): Promise<MarketQuote | null> {
  try {
    const ticker: any = await exchange.fetchTicker(symbol);
    const bid = Number(ticker?.bid ?? 0);
    const ask = Number(ticker?.ask ?? 0);
    if (bid > 0 && ask > 0) return { bid, ask };
  } catch {
    // ignore
  }

  try {
    const ob: any = await exchange.fetchOrderBook(symbol);
    const bid = Number(ob?.bids?.[0]?.[0] ?? 0);
    const ask = Number(ob?.asks?.[0]?.[0] ?? 0);
    if (bid > 0 && ask > 0) return { bid, ask };
  } catch {
    return null;
  }
  return null;
}

export async function fetchQuotesByBase(
  exchange: Exchange,
  symbolsByBase: Record<string, string>,
): Promise<Record<string, MarketQuote>> {
  const out: Record<string, MarketQuote> = {};
  for (const [base, symbol] of Object.entries(symbolsByBase)) {
    const quote = await fetchQuote(exchange, symbol);
    if (quote) out[base] = quote;
  }
  return out;
}

export async function fetchOrderbook(
  exchange: Exchange,
  symbol: string,
  depth = 20,
): Promise<any | null> {
  try {
    return await exchange.fetchOrderBook(symbol, depth);
  } catch {
    return null;
  }
}

export async function fetchVwapQuote(
  exchange: Exchange,
  symbol: string,
  baseQty: number,
  depth = 20,
): Promise<MarketQuote | null> {
  const orderbook = await fetchOrderbook(exchange, symbol, depth);
  if (!orderbook) return null;
  return quoteFromOrderbook(orderbook, baseQty);
}

export async function fetchVwapQuotesByBase(
  exchange: Exchange,
  symbolsByBase: Record<string, string>,
  baseQtyByBase: Record<string, number>,
  depth = 20,
): Promise<Record<string, MarketQuote>> {
  const out: Record<string, MarketQuote> = {};
  for (const [base, symbol] of Object.entries(symbolsByBase)) {
    const baseQty = baseQtyByBase[base];
    if (!baseQty || baseQty <= 0) continue;
    const quote = await fetchVwapQuote(exchange, symbol, baseQty, depth);
    if (quote) out[base] = quote;
  }
  return out;
}

export function feeAdjustedQuote(quote: MarketQuote, buyFeeRate: number, sellFeeRate: number): MarketQuote {
  return {
    bid: applyFee(quote.bid, sellFeeRate, "sell"),
    ask: applyFee(quote.ask, buyFeeRate, "buy"),
  };
}

export async function quoteAndSizeFromNotional(
  exchange: Exchange,
  symbol: string,
  quoteAmount: number,
  side: "buy" | "sell",
  depth = 20,
): Promise<{ quote: MarketQuote; baseQty: number } | null> {
  const orderbook = await fetchOrderbook(exchange, symbol, depth);
  if (!orderbook) return null;

  const levels = side === "sell" ? orderbook?.bids : orderbook?.asks;
  const fill = estimateFillFromQuote(levels, quoteAmount);
  if (!fill) return null;

  const quote = quoteFromOrderbook(orderbook, fill.baseQty);
  if (!quote) return null;
  return { quote, baseQty: fill.baseQty };
}
