export type Direction = "reverse" | "kimchi";
export type BasisMode = "entry" | "unwind";

export type MarketQuote = {
  bid: number;
  ask: number;
};

export function isValidQuote(quote: MarketQuote): boolean {
  return quote.bid > 0 && quote.ask > 0;
}

export type PremiumOpportunity = {
  coin: string;
  direction: Direction;
  premiumPct: number;
  domesticPrice: number;
  overseasPrice: number;
  usdtKrw: number;
};

export type ChainInfo = {
  name: string;
  depositOk: boolean | null;
  withdrawOk: boolean | null;
  confirmations: number | null;
  withdrawFee?: number | null;
  withdrawMin?: number | null;
};

export type TransferStatus = {
  exchange: string;
  coin: string;
  depositOk: boolean | null;
  withdrawOk: boolean | null;
  chains: string[];
  chainInfo: ChainInfo[];
};
