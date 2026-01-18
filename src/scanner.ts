import { premiumPct } from "./calculations";
import { isValidQuote, MarketQuote, PremiumOpportunity } from "./models";
import { selectCandidateCoin } from "./selection";

export function computeReverseOpportunities(
  bithumbQuotes: Record<string, MarketQuote>,
  gateioPerpQuotes: Record<string, MarketQuote>,
  usdtKrw: number,
  thresholdPct = -0.1,
): PremiumOpportunity[] {
  const opportunities: PremiumOpportunity[] = [];
  for (const [coin, bithumbQuote] of Object.entries(bithumbQuotes)) {
    const perpQuote = gateioPerpQuotes[coin];
    if (!perpQuote || !isValidQuote(bithumbQuote) || !isValidQuote(perpQuote)) continue;
    const pct = premiumPct(bithumbQuote.ask, perpQuote.bid, usdtKrw);
    if (pct <= thresholdPct) {
      opportunities.push({
        coin,
        direction: "reverse",
        premiumPct: pct,
        domesticPrice: bithumbQuote.ask,
        overseasPrice: perpQuote.bid,
        usdtKrw,
      });
    }
  }
  opportunities.sort((a, b) => a.premiumPct - b.premiumPct);
  return opportunities;
}

/**
 * B2G (빗썸 → 해외) 용: 김프가 0%에 가까운 코인 찾기
 * - 손실 최소화하며 자금 이동 목적
 * - 절대값 기준으로 필터링 (예: -0.5% ~ +0.5%)
 * - 절대값이 작은 순서로 정렬
 */
export function computeNearZeroOpportunities(
  bithumbQuotes: Record<string, MarketQuote>,
  gateioPerpQuotes: Record<string, MarketQuote>,
  usdtKrw: number,
  maxAbsPct = 0.5,
): PremiumOpportunity[] {
  const opportunities: PremiumOpportunity[] = [];
  for (const [coin, bithumbQuote] of Object.entries(bithumbQuotes)) {
    const perpQuote = gateioPerpQuotes[coin];
    if (!perpQuote || !isValidQuote(bithumbQuote) || !isValidQuote(perpQuote)) continue;
    const pct = premiumPct(bithumbQuote.ask, perpQuote.bid, usdtKrw);
    if (Math.abs(pct) <= maxAbsPct) {
      opportunities.push({
        coin,
        direction: "reverse",
        premiumPct: pct,
        domesticPrice: bithumbQuote.ask,
        overseasPrice: perpQuote.bid,
        usdtKrw,
      });
    }
  }
  // 절대값 기준 0에 가까운 순서로 정렬
  opportunities.sort((a, b) => Math.abs(a.premiumPct) - Math.abs(b.premiumPct));
  return opportunities;
}

export function computeKimchiOpportunities(
  bithumbQuotes: Record<string, MarketQuote>,
  gateioPerpQuotes: Record<string, MarketQuote>,
  usdtKrw: number,
  thresholdPct = 0.0,
): PremiumOpportunity[] {
  const opportunities: PremiumOpportunity[] = [];
  for (const [coin, bithumbQuote] of Object.entries(bithumbQuotes)) {
    const perpQuote = gateioPerpQuotes[coin];
    if (!perpQuote || !isValidQuote(bithumbQuote) || !isValidQuote(perpQuote)) continue;
    const pct = premiumPct(bithumbQuote.bid, perpQuote.ask, usdtKrw);
    if (pct >= thresholdPct) {
      opportunities.push({
        coin,
        direction: "kimchi",
        premiumPct: pct,
        domesticPrice: bithumbQuote.bid,
        overseasPrice: perpQuote.ask,
        usdtKrw,
      });
    }
  }
  opportunities.sort((a, b) => b.premiumPct - a.premiumPct);
  return opportunities;
}

/**
 * DEX Contango: DEX Perp price > Domestic Spot price
 * - Strategy: Buy domestic (spot), Short DEX (perp market sell)
 * - Contango% = (DEX Perp Bid - Domestic Ask × USDT/KRW) / (Domestic Ask × USDT/KRW) × 100
 * - Positive contango = profit opportunity
 */
export function computeContangoOpportunities(
  domesticQuotes: Record<string, MarketQuote>,
  dexPerpQuotes: Record<string, MarketQuote>,
  usdtKrw: number,
  thresholdPct = 0.0,
): PremiumOpportunity[] {
  const opportunities: PremiumOpportunity[] = [];
  for (const [coin, domesticQuote] of Object.entries(domesticQuotes)) {
    const perpQuote = dexPerpQuotes[coin];
    if (!perpQuote || !isValidQuote(domesticQuote) || !isValidQuote(perpQuote)) continue;
    // Contango = (DEX Perp Bid - Domestic Ask in USD) / Domestic Ask in USD × 100
    const domesticAskUsd = domesticQuote.ask / usdtKrw;
    const pct = ((perpQuote.bid - domesticAskUsd) / domesticAskUsd) * 100;
    if (pct >= thresholdPct) {
      opportunities.push({
        coin,
        direction: "contango",
        premiumPct: pct,
        domesticPrice: domesticQuote.ask,
        overseasPrice: perpQuote.bid,
        usdtKrw,
      });
    }
  }
  // Sort by contango % descending (highest profit first)
  opportunities.sort((a, b) => b.premiumPct - a.premiumPct);
  return opportunities;
}

export { selectCandidateCoin };

