import { MarketQuote } from "./models";

export type Level = [number, number];

function normalizeLevels(levels: unknown): Level[] {
  if (!Array.isArray(levels)) return [];
  const out: Level[] = [];
  for (const row of levels) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const price = Number(row[0]);
    const amount = Number(row[1]);
    if (Number.isFinite(price) && Number.isFinite(amount) && price > 0 && amount > 0) out.push([price, amount]);
  }
  return out;
}

function normalizeAsks(asks: unknown): Level[] {
  return normalizeLevels(asks).sort((a, b) => a[0] - b[0]);
}

function normalizeBids(bids: unknown): Level[] {
  return normalizeLevels(bids).sort((a, b) => b[0] - a[0]);
}

export function estimateFillFromBase(levels: unknown, baseQty: number): number | null {
  if (baseQty <= 0) return null;

  let remaining = baseQty;
  let cost = 0.0;
  for (const [price, amount] of normalizeLevels(levels)) {
    const take = Math.min(amount, remaining);
    cost += price * take;
    remaining -= take;
    if (remaining <= 1e-12) break;
  }

  if (remaining > 1e-12) return null;
  return cost / baseQty;
}

export function estimateFillFromQuote(levels: unknown, quoteAmount: number): { baseQty: number; price: number } | null {
  if (quoteAmount <= 0) return null;

  let remaining = quoteAmount;
  let baseQty = 0.0;
  let cost = 0.0;
  for (const [price, amount] of normalizeLevels(levels)) {
    const levelCost = price * amount;
    if (levelCost <= remaining) {
      baseQty += amount;
      cost += levelCost;
      remaining -= levelCost;
    } else {
      const partial = remaining / price;
      baseQty += partial;
      cost += remaining;
      remaining = 0.0;
      break;
    }
  }

  if (remaining > 1e-12 || baseQty <= 0) return null;
  return { baseQty, price: cost / baseQty };
}

export type FillAnalysis = {
  baseQty: number;
  quoteQty: number;
  vwapPrice: number;
  bestPrice: number;
  worstPrice: number;
  levels: number;
  impactPct: number;
};

export function analyzeBuyFillFromQuote(asks: unknown, quoteAmount: number): FillAnalysis | null {
  if (quoteAmount <= 0) return null;
  const levels = normalizeAsks(asks);
  const firstLevel = levels[0];
  if (!firstLevel) return null;

  const bestPrice = firstLevel[0];
  let remaining = quoteAmount;
  let baseQty = 0.0;
  let cost = 0.0;
  let worstPrice = bestPrice;
  let usedLevels = 0;

  for (const [price, amount] of levels) {
    if (remaining <= 1e-12) break;
    const levelCost = price * amount;
    usedLevels += 1;
    if (levelCost <= remaining) {
      baseQty += amount;
      cost += levelCost;
      remaining -= levelCost;
      worstPrice = price;
    } else {
      const partial = remaining / price;
      baseQty += partial;
      cost += remaining;
      remaining = 0.0;
      worstPrice = price;
      break;
    }
  }

  if (remaining > 1e-12 || baseQty <= 0) return null;
  const vwapPrice = cost / baseQty;
  const impactPct = ((worstPrice - bestPrice) / bestPrice) * 100.0;
  return { baseQty, quoteQty: quoteAmount, vwapPrice, bestPrice, worstPrice, levels: usedLevels, impactPct };
}

export function analyzeSellFillFromBase(bids: unknown, baseQty: number): FillAnalysis | null {
  if (baseQty <= 0) return null;
  const levels = normalizeBids(bids);
  const firstLevel = levels[0];
  if (!firstLevel) return null;

  const bestPrice = firstLevel[0];
  let remaining = baseQty;
  let proceeds = 0.0;
  let worstPrice = bestPrice;
  let usedLevels = 0;

  for (const [price, amount] of levels) {
    if (remaining <= 1e-12) break;
    const take = Math.min(amount, remaining);
    proceeds += price * take;
    remaining -= take;
    usedLevels += 1;
    worstPrice = price;
  }

  if (remaining > 1e-12) return null;
  const vwapPrice = proceeds / baseQty;
  const impactPct = ((bestPrice - worstPrice) / bestPrice) * 100.0;
  return { baseQty, quoteQty: proceeds, vwapPrice, bestPrice, worstPrice, levels: usedLevels, impactPct };
}

export function quoteFromOrderbook(orderbook: unknown, baseQty: number): MarketQuote | null {
  const bids = typeof orderbook === "object" && orderbook !== null ? (orderbook as any).bids : undefined;
  const asks = typeof orderbook === "object" && orderbook !== null ? (orderbook as any).asks : undefined;

  const bidPrice = estimateFillFromBase(bids, baseQty);
  const askPrice = estimateFillFromBase(asks, baseQty);
  if (!bidPrice || !askPrice) return null;
  return { bid: bidPrice, ask: askPrice };
}
