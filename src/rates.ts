import { midPrice } from "./calculations";
import { fetchJson } from "./http";

const RATE_SOURCE_ENV = "USDT_KRW_RATE_SOURCE";
const RATE_OVERRIDE_ENV = "USDT_KRW_RATE_OVERRIDE";
const PREMIUM_SOURCE_ENV = "USDT_PREMIUM_SOURCE";

const RATE_SOURCE_LABELS: Record<string, string> = {
  fx_usd_krw: "USD/KRW FX (USDT≈USD)",
  fx_plus_usdt_premium: "USD/KRW FX + USDT premium (KRW-USDT)",
  bithumb_usdt: "Bithumb USDT/KRW",
  upbit_usdt: "Upbit USDT/KRW",
  custom: "Custom override",
};

function resolveRateSource(source?: string | null): string {
  const value = (source ?? process.env[RATE_SOURCE_ENV] ?? "bithumb_usdt").trim().toLowerCase();
  const aliases: Record<string, string> = {
    fx: "fx_usd_krw",
    usdkrw: "fx_usd_krw",
    usd_krw: "fx_usd_krw",
    theddari: "fx_plus_usdt_premium",
    fx_usd_krw: "fx_usd_krw",
    fx_plus_usdt_premium: "fx_plus_usdt_premium",
    bithumb: "bithumb_usdt",
    bithumb_usdt: "bithumb_usdt",
    upbit: "upbit_usdt",
    upbit_usdt: "upbit_usdt",
    custom: "custom",
  };
  const resolved = aliases[value];
  if (!resolved) throw new Error(`Unsupported USDT/KRW rate source: ${value}`);
  return resolved;
}

export function usdtKrwRateSource(source?: string | null): string {
  return resolveRateSource(source);
}

export function usdtKrwRateLabel(source?: string | null): string {
  const resolved = resolveRateSource(source);
  return RATE_SOURCE_LABELS[resolved] ?? resolved;
}

async function fetchBithumbUsdtKrw(): Promise<number> {
  const payload = await fetchJson<any>("https://api.bithumb.com/public/orderbook/USDT_KRW", { timeoutMs: 5000 });
  const bid = Number(payload?.data?.bids?.[0]?.price ?? 0);
  const ask = Number(payload?.data?.asks?.[0]?.price ?? 0);
  const rate = midPrice(bid, ask);
  if (rate <= 0) throw new Error("Failed to fetch USDT/KRW rate from Bithumb");
  return rate;
}

async function fetchUpbitUsdtKrw(): Promise<number> {
  const payload = await fetchJson<any[]>("https://api.upbit.com/v1/ticker?markets=KRW-USDT", { timeoutMs: 5000 });
  if (!payload?.length) throw new Error("Empty Upbit ticker payload for KRW-USDT");
  const first = payload[0];
  const price = Number(first?.trade_price ?? 0);
  if (price <= 0) throw new Error("Invalid Upbit USDT/KRW trade_price");
  return price;
}

async function fetchFxUsdKrw(): Promise<number> {
  const payload = await fetchJson<any>("https://open.er-api.com/v6/latest/USD", { timeoutMs: 5000 });
  if (payload?.result !== "success") throw new Error("USD/KRW FX payload not successful");
  const value = Number(payload?.rates?.KRW ?? 0);
  if (value <= 0) throw new Error("Invalid USD/KRW FX rate");
  return value;
}

function fetchCustomRate(): number {
  const raw = (process.env[RATE_OVERRIDE_ENV] ?? "").trim();
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid ${RATE_OVERRIDE_ENV} value: ${raw}`);
  return value;
}

function resolvePremiumSource(): "bithumb_usdt" | "upbit_usdt" {
  const raw = (process.env[PREMIUM_SOURCE_ENV] ?? "bithumb_usdt").trim().toLowerCase();
  if (raw === "upbit" || raw === "upbit_usdt") return "upbit_usdt";
  return "bithumb_usdt";
}

export type UsdtKrwRateContext = {
  source: string;
  label: string;
  usdtKrw: number;
  fxUsdKrw?: number;
  domesticUsdtKrw?: number;
  usdtPremiumPct?: number;
  premiumSource?: "bithumb_usdt" | "upbit_usdt";
};

export async function usdtKrwRate(source?: string | null): Promise<number> {
  const resolved = resolveRateSource(source);
  if (resolved === "fx_usd_krw") return fetchFxUsdKrw();
  if (resolved === "upbit_usdt") return fetchUpbitUsdtKrw();
  if (resolved === "bithumb_usdt") return fetchBithumbUsdtKrw();
  if (resolved === "fx_plus_usdt_premium") {
    const fx = await fetchFxUsdKrw();
    const premiumSource = resolvePremiumSource();
    const domestic = premiumSource === "upbit_usdt" ? await fetchUpbitUsdtKrw() : await fetchBithumbUsdtKrw();
    // Using domestic KRW-USDT directly captures the Korea USDT premium vs FX USD/KRW.
    // Still compute the pct vs FX for transparency/debugging.
    const pct = ((domestic - fx) / fx) * 100.0;
    if (!Number.isFinite(pct)) return domestic;
    return domestic;
  }
  if (resolved === "custom") return fetchCustomRate();
  throw new Error(`Unsupported USDT/KRW rate source: ${resolved}`);
}

export async function usdtKrwRateContext(source?: string | null): Promise<UsdtKrwRateContext> {
  const resolved = resolveRateSource(source);
  const label = usdtKrwRateLabel(resolved);

  if (resolved === "fx_plus_usdt_premium") {
    const fxUsdKrw = await fetchFxUsdKrw();
    const premiumSource = resolvePremiumSource();
    const domesticUsdtKrw = premiumSource === "upbit_usdt" ? await fetchUpbitUsdtKrw() : await fetchBithumbUsdtKrw();
    const usdtPremiumPct = ((domesticUsdtKrw - fxUsdKrw) / fxUsdKrw) * 100.0;
    return {
      source: resolved,
      label,
      usdtKrw: domesticUsdtKrw,
      fxUsdKrw,
      domesticUsdtKrw,
      usdtPremiumPct: Number.isFinite(usdtPremiumPct) ? usdtPremiumPct : undefined,
      premiumSource,
    };
  }

  if (resolved === "fx_usd_krw") {
    const fxUsdKrw = await fetchFxUsdKrw();
    return { source: resolved, label, usdtKrw: fxUsdKrw, fxUsdKrw };
  }

  if (resolved === "bithumb_usdt") {
    const domesticUsdtKrw = await fetchBithumbUsdtKrw();
    return { source: resolved, label, usdtKrw: domesticUsdtKrw, domesticUsdtKrw, premiumSource: "bithumb_usdt" };
  }

  if (resolved === "upbit_usdt") {
    const domesticUsdtKrw = await fetchUpbitUsdtKrw();
    return { source: resolved, label, usdtKrw: domesticUsdtKrw, domesticUsdtKrw, premiumSource: "upbit_usdt" };
  }

  if (resolved === "custom") {
    const value = fetchCustomRate();
    return { source: resolved, label, usdtKrw: value };
  }

  const value = await usdtKrwRate(resolved);
  return { source: resolved, label, usdtKrw: value };
}
