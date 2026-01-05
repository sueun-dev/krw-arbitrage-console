import { basisPct } from "./calculations";
import { commonChainPairs } from "./chains";
import { BasisMode, isValidQuote, MarketQuote, PremiumOpportunity, TransferStatus } from "./models";
import { bithumbInoutStatuses, gateioCurrencyStatuses } from "./transfers";

export function selectCandidateCoin(
  opportunities: Iterable<PremiumOpportunity>,
  gateioSpotQuotes: Record<string, MarketQuote>,
  gateioPerpQuotes: Record<string, MarketQuote>,
  basisThresholdPct: number,
  mode: BasisMode,
): string | null {
  for (const opp of opportunities) {
    const coin = opp.coin;
    const spotQuote = gateioSpotQuotes[coin];
    const perpQuote = gateioPerpQuotes[coin];
    if (!spotQuote || !perpQuote || !isValidQuote(spotQuote) || !isValidQuote(perpQuote)) continue;

    const spotPrice = mode === "unwind" ? spotQuote.bid : spotQuote.ask;
    const perpPrice = mode === "unwind" ? perpQuote.ask : perpQuote.bid;
    if (basisPct(spotPrice, perpPrice) <= basisThresholdPct) return coin;
  }
  return null;
}

export async function selectTransferableCandidateCoin(
  opportunities: Iterable<PremiumOpportunity>,
  gateioSpotQuotes: Record<string, MarketQuote>,
  gateioPerpQuotes: Record<string, MarketQuote>,
  gateSpot: any,
  basisThresholdPct: number,
  mode: BasisMode,
): Promise<{ coin: string; bithumb: TransferStatus; gateio: TransferStatus; chainPairs: Array<[string, string]> } | null> {
  const basisOk: string[] = [];
  for (const opp of opportunities) {
    const coin = opp.coin;
    const spotQuote = gateioSpotQuotes[coin];
    const perpQuote = gateioPerpQuotes[coin];
    if (!spotQuote || !perpQuote || !isValidQuote(spotQuote) || !isValidQuote(perpQuote)) continue;

    const spotPrice = mode === "unwind" ? spotQuote.bid : spotQuote.ask;
    const perpPrice = mode === "unwind" ? perpQuote.ask : perpQuote.bid;
    if (basisPct(spotPrice, perpPrice) <= basisThresholdPct) basisOk.push(coin);
  }
  if (!basisOk.length) return null;

  const [bStatuses, gStatuses] = await Promise.all([bithumbInoutStatuses(basisOk), gateioCurrencyStatuses(gateSpot, basisOk)]);

  for (const coin of basisOk) {
    const b = bStatuses[coin];
    const g = gStatuses[coin];
    if (!(b?.depositOk === true && b?.withdrawOk === true)) continue;
    if (!(g?.depositOk === true && g?.withdrawOk === true)) continue;

    const chainPairs = commonChainPairs(b.chains, g.chains);
    if (!chainPairs.length) continue;
    return { coin, bithumb: b, gateio: g, chainPairs };
  }
  return null;
}

