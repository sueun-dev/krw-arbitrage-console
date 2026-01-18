const ALIASES: Record<string, string> = {
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
  "BNBSMARTCHAIN": "BSC",
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
  // Nervos (fix)
  NERVOSNETWORK: "CKB",
  // Bifrost
  BFC: "BFC",
  BIFROST: "BFC",
  // Metal
  MTL: "MTL",
  METALL2: "MTL",
  MTLETH: "MTL",
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

