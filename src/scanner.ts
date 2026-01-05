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

export { selectCandidateCoin };

