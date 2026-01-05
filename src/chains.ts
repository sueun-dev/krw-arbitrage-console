const ALIASES: Record<string, string> = {
  ERC20: "ETH",
  ETHEREUM: "ETH",
  ARBITRUM: "ARBITRUM",
  ARB: "ARBITRUM",
  OPTIMISM: "OPTIMISM",
  OP: "OPTIMISM",
  BSC: "BSC",
  BEP20: "BSC",
  TRON: "TRON",
  TRC20: "TRON",
  SOL: "SOL",
  SOLANA: "SOL",
  APT: "APTOS",
  APTOS: "APTOS",
  MATIC: "POLYGON",
  POLYGON: "POLYGON",
  TON: "TON",
};

export function normalizeChainName(name: string): string {
  const raw = (name || "").trim().toUpperCase();
  if (!raw) return "";
  const compact = raw.replace(/\s+/g, "");
  return ALIASES[compact] ?? compact;
}

export function commonChains(a: Iterable<string>, b: Iterable<string>): string[] {
  const as = new Set(Array.from(a, (x) => normalizeChainName(x)).filter(Boolean));
  const bs = new Set(Array.from(b, (x) => normalizeChainName(x)).filter(Boolean));
  return Array.from(as).filter((x) => bs.has(x)).sort();
}

export function commonChainPairs(a: Iterable<string>, b: Iterable<string>): Array<[string, string]> {
  const aNorm = new Map<string, string>();
  for (const x of a) {
    const n = normalizeChainName(x);
    if (n) aNorm.set(n, x);
  }
  const out: Array<[string, string]> = [];
  for (const y of b) {
    const n = normalizeChainName(y);
    const originalA = aNorm.get(n);
    if (originalA && n) out.push([originalA, y]);
  }
  return out;
}

