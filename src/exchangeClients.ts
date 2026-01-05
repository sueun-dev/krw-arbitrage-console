import ccxt from "ccxt";
import type { Exchange } from "ccxt";

function getEnv(...names: string[]): string {
  for (const name of names) {
    const value = (process.env[name] ?? "").trim();
    if (value) return value;
  }
  return "";
}

export async function createBithumb(requireKeys: boolean): Promise<Exchange> {
  const apiKey = getEnv("BITHUMB_API_KEY");
  const secret = getEnv("BITHUMB_API_SECRET", "BITHUMB_SECRET_KEY");
  if (requireKeys && !(apiKey && secret)) throw new Error("Missing Bithumb API keys (BITHUMB_API_KEY / BITHUMB_API_SECRET).");

  const params: any = { enableRateLimit: true };
  if (apiKey && secret) params.apiKey = apiKey, params.secret = secret;
  const ex: any = new (ccxt as any).bithumb(params);
  await ex.loadMarkets();
  return ex as Exchange;
}

export async function createGateioSpot(requireKeys: boolean, usePublicApi: boolean): Promise<Exchange> {
  const apiKey = getEnv("GATEIO_API_KEY");
  const secret = getEnv("GATEIO_API_SECRET");
  if (requireKeys && !usePublicApi && !(apiKey && secret)) throw new Error("Missing GateIO API keys (GATEIO_API_KEY / GATEIO_API_SECRET).");

  const params: any = { enableRateLimit: true, options: { defaultType: "spot" } };
  if (!usePublicApi && apiKey && secret) params.apiKey = apiKey, params.secret = secret;
  const ex: any = new (ccxt as any).gateio(params);
  await ex.loadMarkets();
  return ex as Exchange;
}

export async function createGateioPerp(requireKeys: boolean, usePublicApi: boolean): Promise<Exchange> {
  const apiKey = getEnv("GATEIO_API_KEY");
  const secret = getEnv("GATEIO_API_SECRET");
  if (requireKeys && !usePublicApi && !(apiKey && secret)) throw new Error("Missing GateIO API keys (GATEIO_API_KEY / GATEIO_API_SECRET).");

  const params: any = { enableRateLimit: true, options: { defaultType: "swap" } };
  if (!usePublicApi && apiKey && secret) params.apiKey = apiKey, params.secret = secret;
  const ex: any = new (ccxt as any).gateio(params);
  await ex.loadMarkets();
  return ex as Exchange;
}

export async function createUpbit(requireKeys: boolean): Promise<Exchange> {
  const apiKey = getEnv("UPBIT_API_KEY", "UPBIT_ACCESS_KEY");
  const secret = getEnv("UPBIT_API_SECRET", "UPBIT_SECRET_KEY");
  if (requireKeys && !(apiKey && secret)) throw new Error("Missing Upbit API keys (UPBIT_API_KEY / UPBIT_API_SECRET).");

  const params: any = { enableRateLimit: true };
  if (apiKey && secret) params.apiKey = apiKey, params.secret = secret;
  const ex: any = new (ccxt as any).upbit(params);
  await ex.loadMarkets();
  return ex as Exchange;
}

export async function createBybitSpot(requireKeys: boolean): Promise<Exchange> {
  const apiKey = getEnv("BYBIT_API_KEY");
  const secret = getEnv("BYBIT_API_SECRET");
  if (requireKeys && !(apiKey && secret)) throw new Error("Missing Bybit API keys (BYBIT_API_KEY / BYBIT_API_SECRET).");

  const params: any = { enableRateLimit: true, options: { defaultType: "spot" } };
  if (apiKey && secret) params.apiKey = apiKey, params.secret = secret;
  const ex: any = new (ccxt as any).bybit(params);
  await ex.loadMarkets();
  return ex as Exchange;
}

export async function createBybitPerp(requireKeys: boolean): Promise<Exchange> {
  const apiKey = getEnv("BYBIT_API_KEY");
  const secret = getEnv("BYBIT_API_SECRET");
  if (requireKeys && !(apiKey && secret)) throw new Error("Missing Bybit API keys (BYBIT_API_KEY / BYBIT_API_SECRET).");

  const params: any = { enableRateLimit: true, options: { defaultType: "swap" } };
  if (apiKey && secret) params.apiKey = apiKey, params.secret = secret;
  const ex: any = new (ccxt as any).bybit(params);
  await ex.loadMarkets();
  return ex as Exchange;
}

export async function createHyperliquidSpot(requireKeys: boolean): Promise<Exchange> {
  const walletAddress = getEnv("HYPERLIQUID_WALLET_ADDRESS");
  const privateKey = getEnv("HYPERLIQUID_PRIVATE_KEY");
  if (requireKeys && !(walletAddress && privateKey)) {
    throw new Error("Missing Hyperliquid keys (HYPERLIQUID_WALLET_ADDRESS / HYPERLIQUID_PRIVATE_KEY).");
  }

  const params: any = { enableRateLimit: true, options: { defaultType: "spot" } };
  if (walletAddress && privateKey) {
    params.walletAddress = walletAddress;
    params.privateKey = privateKey;
  }
  const ex: any = new (ccxt as any).hyperliquid(params);
  await ex.loadMarkets();
  return ex as Exchange;
}

export async function createHyperliquidPerp(requireKeys: boolean): Promise<Exchange> {
  const walletAddress = getEnv("HYPERLIQUID_WALLET_ADDRESS");
  const privateKey = getEnv("HYPERLIQUID_PRIVATE_KEY");
  if (requireKeys && !(walletAddress && privateKey)) {
    throw new Error("Missing Hyperliquid keys (HYPERLIQUID_WALLET_ADDRESS / HYPERLIQUID_PRIVATE_KEY).");
  }

  const params: any = { enableRateLimit: true, options: { defaultType: "swap" } };
  if (walletAddress && privateKey) {
    params.walletAddress = walletAddress;
    params.privateKey = privateKey;
  }
  const ex: any = new (ccxt as any).hyperliquid(params);
  await ex.loadMarkets();
  return ex as Exchange;
}

export async function createOkxSpot(requireKeys: boolean): Promise<Exchange> {
  const apiKey = getEnv("OKX_API_KEY");
  const secret = getEnv("OKX_API_SECRET");
  const passphrase = getEnv("OKX_API_PASSPHRASE", "OKX_PASSPHRASE");
  if (requireKeys && !(apiKey && secret && passphrase)) {
    throw new Error("Missing OKX API keys (OKX_API_KEY / OKX_API_SECRET / OKX_API_PASSPHRASE).");
  }

  const params: any = { enableRateLimit: true, options: { defaultType: "spot" } };
  if (apiKey && secret && passphrase) {
    params.apiKey = apiKey;
    params.secret = secret;
    params.password = passphrase;
  }
  const ex: any = new (ccxt as any).okx(params);
  await ex.loadMarkets();
  return ex as Exchange;
}

export async function createOkxPerp(requireKeys: boolean): Promise<Exchange> {
  const apiKey = getEnv("OKX_API_KEY");
  const secret = getEnv("OKX_API_SECRET");
  const passphrase = getEnv("OKX_API_PASSPHRASE", "OKX_PASSPHRASE");
  if (requireKeys && !(apiKey && secret && passphrase)) {
    throw new Error("Missing OKX API keys (OKX_API_KEY / OKX_API_SECRET / OKX_API_PASSPHRASE).");
  }

  const params: any = { enableRateLimit: true, options: { defaultType: "swap" } };
  if (apiKey && secret && passphrase) {
    params.apiKey = apiKey;
    params.secret = secret;
    params.password = passphrase;
  }
  const ex: any = new (ccxt as any).okx(params);
  await ex.loadMarkets();
  return ex as Exchange;
}
