/**
 * @fileoverview Blockchain chain name normalization and matching utilities.
 * Provides consistent chain naming across different exchanges.
 */

/**
 * Chain name aliases mapping various exchange-specific names to canonical names.
 * Keys are uppercase with spaces removed, values are canonical chain names.
 */
const CHAIN_ALIASES: Readonly<Record<string, string>> = {
  // Ethereum
  ERC20: "ETH",
  ETHEREUM: "ETH",
  ETH: "ETH",
  // Arbitrum
  ARBITRUM: "ARBITRUM",
  ARBITRUMONE: "ARBITRUM",
  ARB: "ARBITRUM",
  ARBONE: "ARBITRUM",
  // Optimism
  OPTIMISM: "OPTIMISM",
  OP: "OPTIMISM",
  // BSC
  BSC: "BSC",
  BEP20: "BSC",
  BNBSMARTCHAIN: "BSC",
  "BNBSMARTCHAIN(BEP20)": "BSC",
  BINANCE: "BSC",
  // Tron
  TRON: "TRON",
  TRC20: "TRON",
  TRX: "TRON",
  // Solana
  SOL: "SOL",
  SOLANA: "SOL",
  // Aptos
  APT: "APTOS",
  APTOS: "APTOS",
  // Polygon
  MATIC: "POLYGON",
  POLYGON: "POLYGON",
  POLYGONPOS: "POLYGON",
  // TON
  TON: "TON",
  TONCOIN: "TON",
  // Bitcoin
  BTC: "BTC",
  BITCOIN: "BTC",
  // Bitcoin Cash
  BCH: "BCH",
  BITCOINCASH: "BCH",
  // ICON
  ICX: "ICX",
  ICON: "ICX",
  // aelf
  ELF: "ELF",
  AELF: "ELF",
  // WAX
  WAX: "WAX",
  WAXP: "WAX",
  // Theta
  THETA: "THETA",
  THETANETWORK: "THETA",
  // Waves
  WAVES: "WAVES",
  // Ontology
  ONT: "ONT",
  ONTOLOGY: "ONT",
  // Qtum
  QTUM: "QTUM",
  // Ravencoin
  RVN: "RVN",
  RAVENCOIN: "RVN",
  // Decred
  DCR: "DCR",
  DECRED: "DCR",
  // Zcash
  ZEC: "ZEC",
  ZCASH: "ZEC",
  // Horizen
  ZEN: "ZEN",
  HORIZEN: "ZEN",
  // Stacks
  STX: "STX",
  STACKS: "STX",
  // Flux
  FLUX: "FLUX",
  // Nervos
  CKB: "CKB",
  NERVOS: "CKB",
  NERVOSNETWORK: "CKB",
  // Arweave
  AR: "AR",
  ARWEAVE: "AR",
  // Oasis
  ROSE: "ROSE",
  OASIS: "ROSE",
  OASISNETWORK: "ROSE",
  // Astar
  ASTR: "ASTAR",
  ASTAR: "ASTAR",
  // MultiversX (Elrond)
  EGLD: "EGLD",
  MULTIVERSX: "EGLD",
  ELROND: "EGLD",
  // Ethereum Classic
  ETC: "ETC",
  ETHEREUMCLASSIC: "ETC",
  // Neo
  NEO: "NEO",
  NEON3: "NEO",
  "NEON3(N3)": "NEO",
  GAS: "GAS",
  NEOGAS: "GAS",
  // Zilliqa
  ZIL: "ZIL",
  ZILLIQA: "ZIL",
  // zkSync
  ZKSYNC: "ZKSYNC",
  ZKSERA: "ZKSYNC",
  ZKSYNCERA: "ZKSYNC",
  // Chiliz
  CHZ: "CHZ",
  CHZ2: "CHZ",
  CHILIZ: "CHZ",
  CHILIZCHAIN: "CHZ",
  // Bittensor
  TAO: "TAO",
  BITTENSOR: "TAO",
  // Story (IP)
  IP: "IP",
  STORY: "IP",
  // Monad
  MON: "MON",
  MONAD: "MON",
  // Cosmos ecosystem
  ATOM: "ATOM",
  COSMOS: "ATOM",
  // Avalanche
  AVAX: "AVAX",
  AVALANCHE: "AVAX",
  AVAXC: "AVAX",
  "AVALANCHEC-CHAIN": "AVAX",
  // Sui
  SUI: "SUI",
  // Base
  BASE: "BASE",
  // Linea
  LINEA: "LINEA",
  // Scroll
  SCROLL: "SCROLL",
  // Blast
  BLAST: "BLAST",
  // SEI
  SEI: "SEI",
  // Celestia
  TIA: "TIA",
  CELESTIA: "TIA",
  // NEAR
  NEAR: "NEAR",
  // Hedera
  HBAR: "HBAR",
  HEDERA: "HBAR",
  // Cardano
  ADA: "ADA",
  CARDANO: "ADA",
  // XRP
  XRP: "XRP",
  RIPPLE: "XRP",
  // Polkadot
  DOT: "DOT",
  POLKADOT: "DOT",
  // Kaspa
  KAS: "KAS",
  KASPA: "KAS",
  // DOGE
  DOGE: "DOGE",
  DOGECOIN: "DOGE",
  // Litecoin
  LTC: "LTC",
  LITECOIN: "LTC",
  // Initia
  INIT: "INIT",
  INITIA: "INIT",
  // Merlin
  MERL: "MERL",
  MERLINCHAIN: "MERL",
  MERLBTC: "MERL",
  // Shentu (CTK)
  CTK: "CTK",
  SHENTU: "CTK",
  // Sophon
  SOPH: "SOPH",
  SOPHON: "SOPH",
  // Starknet
  STRK: "STRK",
  STARKNET: "STRK",
  // Mantle
  MNT: "MNT",
  MANTLE: "MNT",
  // Kaia (previously Klaytn)
  KAIA: "KAIA",
  KLAYTN: "KAIA",
  KLAY: "KAIA",
  // Mode
  MODE: "MODE",
  // Zora
  ZORA: "ZORA",
  // Celo
  CELO: "CELO",
  // Flow
  FLOW: "FLOW",
  // Fantom
  FTM: "FTM",
  FANTOM: "FTM",
  // Algorand
  ALGO: "ALGO",
  ALGORAND: "ALGO",
  // Cronos
  CRO: "CRO",
  CRONOS: "CRO",
  // ICP
  ICP: "ICP",
  INTERNETCOMPUTER: "ICP",
  // VeChain
  VET: "VET",
  VECHAIN: "VET",
  // IOTA
  IOTA: "IOTA",
  // Filecoin
  FIL: "FIL",
  FILECOIN: "FIL",
  // Bitcoin SV
  BSV: "BSV",
  BITCOINSV: "BSV",
  // dYdX
  DYDX: "DYDX",
  DYDXCHAIN: "DYDX",
  // Injective
  INJ: "INJ",
  INJECTIVE: "INJ",
  // Osmosis
  OSMO: "OSMO",
  OSMOSIS: "OSMO",
  // Akash
  AKT: "AKT",
  AKASH: "AKT",
  // Secret
  SCRT: "SCRT",
  SECRET: "SCRT",
  // Kujira
  KUJI: "KUJI",
  KUJIRA: "KUJI",
  // Juno
  JUNO: "JUNO",
  // Terra
  LUNA: "LUNA",
  TERRA: "LUNA",
  // Sommelier
  SOMM: "SOMM",
  SOMMELIER: "SOMM",
  // Vaulta (A)
  A: "VAULTA",
  VAULTA: "VAULTA",
  // Enjin
  ENJ: "ENJ",
  ENJIN: "ENJ",
  // Stellar
  XLM: "XLM",
  STELLAR: "XLM",
  // Tezos
  XTZ: "XTZ",
  TEZOS: "XTZ",
  XTZEVM: "XTZ",
  // eCash
  XEC: "XEC",
  ECASH: "XEC",
  // MediBloc
  MED: "MED",
  MEDIBLOC: "MED",
  // Proton
  XPR: "XPR",
  PROTON: "XPR",
  // Aergo
  AERGO: "AERGO",
  // Solar
  SXP: "SXP",
  SOLAR: "SXP",
  // IOST
  IOST: "IOST",
  // Bifrost
  BFC: "BFC",
  BIFROST: "BFC",
  // Metal
  MTL: "MTL",
  METALL2: "MTL",
  MTLETH: "MTL",
};

/**
 * Normalizes a chain name to its canonical form.
 *
 * @param name - The chain name to normalize (case-insensitive)
 * @returns The canonical chain name, or the input uppercased if no alias found
 *
 * @example
 * ```typescript
 * normalizeChainName("ERC20");     // Returns "ETH"
 * normalizeChainName("trc20");     // Returns "TRON"
 * normalizeChainName("Ethereum");  // Returns "ETH"
 * normalizeChainName("Unknown");   // Returns "UNKNOWN"
 * ```
 */
export function normalizeChainName(name: string): string {
  const raw = (name || "").trim().toUpperCase();
  if (!raw) {
    return "";
  }
  const compact = raw.replace(/\s+/g, "");
  return CHAIN_ALIASES[compact] ?? compact;
}

/**
 * Finds common chains between two sets of chain names.
 *
 * @param a - First set of chain names
 * @param b - Second set of chain names
 * @returns Array of normalized chain names that appear in both sets
 *
 * @example
 * ```typescript
 * commonChains(["ERC20", "TRC20"], ["ETH", "TRON"]);
 * // Returns ["ETH", "TRON"]
 * ```
 */
export function commonChains(a: Iterable<string>, b: Iterable<string>): string[] {
  const normalizedA = new Set(
    Array.from(a, (x) => normalizeChainName(x)).filter(Boolean)
  );
  const normalizedB = new Set(
    Array.from(b, (x) => normalizeChainName(x)).filter(Boolean)
  );
  return Array.from(normalizedA)
    .filter((x) => normalizedB.has(x))
    .sort();
}

/**
 * Finds common chains between two sets and returns original name pairs.
 *
 * @param a - First set of chain names
 * @param b - Second set of chain names
 * @returns Array of [originalA, originalB] pairs for matching chains
 *
 * @example
 * ```typescript
 * commonChainPairs(["ERC20", "TRC20"], ["Ethereum", "TRON"]);
 * // Returns [["ERC20", "Ethereum"], ["TRC20", "TRON"]]
 * ```
 */
export function commonChainPairs(
  a: Iterable<string>,
  b: Iterable<string>
): Array<[string, string]> {
  const normalizedToOriginalA = new Map<string, string>();
  for (const x of a) {
    const normalized = normalizeChainName(x);
    if (normalized) {
      normalizedToOriginalA.set(normalized, x);
    }
  }

  const result: Array<[string, string]> = [];
  for (const y of b) {
    const normalized = normalizeChainName(y);
    const originalA = normalizedToOriginalA.get(normalized);
    if (originalA && normalized) {
      result.push([originalA, y]);
    }
  }
  return result;
}

/**
 * Checks if a chain name is a known blockchain.
 *
 * @param name - The chain name to check
 * @returns True if the chain is recognized
 */
export function isKnownChain(name: string): boolean {
  const normalized = normalizeChainName(name);
  return normalized !== "" && Object.values(CHAIN_ALIASES).includes(normalized);
}
