export function premiumPct(domesticPriceKrw: number, overseasPriceUsdt: number, usdtKrw: number): number {
  if (domesticPriceKrw <= 0) throw new Error("domesticPriceKrw must be > 0");
  if (overseasPriceUsdt <= 0) throw new Error("overseasPriceUsdt must be > 0");
  if (usdtKrw <= 0) throw new Error("usdtKrw must be > 0");

  const overseasKrw = overseasPriceUsdt * usdtKrw;
  return ((domesticPriceKrw - overseasKrw) / overseasKrw) * 100.0;
}

export function applyFee(price: number, feeRate: number, side: "buy" | "sell"): number {
  if (price <= 0) throw new Error("price must be > 0");
  if (feeRate < 0) throw new Error("feeRate must be >= 0");
  if (side === "buy") return price * (1.0 + feeRate);
  if (side === "sell") return price * (1.0 - feeRate);
  // exhaustive
  throw new Error("side must be 'buy' or 'sell'");
}

export function basisPct(spotExecPrice: number, perpExecPrice: number): number {
  if (spotExecPrice <= 0) throw new Error("spotExecPrice must be > 0");
  if (perpExecPrice <= 0) throw new Error("perpExecPrice must be > 0");
  return (Math.abs(perpExecPrice - spotExecPrice) / spotExecPrice) * 100.0;
}

export function midPrice(bid: number, ask: number): number {
  if (bid > 0 && ask > 0) return (bid + ask) / 2.0;
  if (bid > 0) return bid;
  if (ask > 0) return ask;
  return 0.0;
}

