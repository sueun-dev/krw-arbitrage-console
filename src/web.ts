import http from "node:http";
import path from "node:path";
import fs from "node:fs/promises";
import {
  createBybitPerp,
  createBybitSpot,
  createGateioPerp,
  createGateioSpot,
  createHyperliquidPerp,
  createHyperliquidSpot,
  createOkxPerp,
  createOkxSpot,
} from "./exchangeClients";
import {
  OverseasExchange,
  SharedDomesticResources,
  SharedOverseasResources,
  watchReverseTopN,
  WatchReverseTick,
  WatchStatus,
} from "./flows";
import {
  bithumbKrwSymbolsRest,
  bybitSpotAndPerpSymbols,
  gateioSpotAndPerpSymbols,
  hyperliquidSpotAndPerpSymbols,
  okxSpotAndPerpSymbols,
  upbitKrwSymbolsRest,
} from "./symbolUniverse";
import {
  BithumbOrderbookWs,
  BybitPerpOrderbookWs,
  BybitSpotOrderbookWs,
  GateioFuturesBookTickerWs,
  GateioSpotTickerWs,
  HyperliquidPerpOrderbookWs,
  HyperliquidSpotOrderbookWs,
  OkxPerpTickerWs,
  OkxSpotTickerWs,
  UpbitOrderbookWs,
} from "./wsQuotes";

type DomesticExchange = "bithumb" | "upbit";

type WatchConfig = {
  topN: number;
  displayTopK: number;
  displayFarK: number;
  intervalSec: number;
  domesticExchange: DomesticExchange;
  overseasExchange: OverseasExchange;
};

const DEFAULT_CONFIG: WatchConfig = {
  topN: 10,
  displayTopK: 5,
  displayFarK: 5,
  intervalSec: 1,
  domesticExchange: "bithumb",
  overseasExchange: "gateio",
};

const PORT = Number(process.env.PORT ?? 5177);
const publicDir = path.join(process.cwd(), "public");

const DOMESTIC_EXCHANGES: DomesticExchange[] = ["bithumb", "upbit"];
const OVERSEAS_EXCHANGES: OverseasExchange[] = ["gateio", "bybit", "okx", "hyperliquid"];

let currentConfig: WatchConfig = { ...DEFAULT_CONFIG };
const sharedOverseas: Record<OverseasExchange, SharedOverseasResources | null> = {
  gateio: null,
  bybit: null,
  okx: null,
  hyperliquid: null,
};
const sharedDomestic: Record<DomesticExchange, SharedDomesticResources | null> = {
  bithumb: null,
  upbit: null,
};
const overseasInitState: Record<OverseasExchange, { attempts: number; timer: NodeJS.Timeout | null; inFlight: boolean }> = {
  gateio: { attempts: 0, timer: null, inFlight: false },
  bybit: { attempts: 0, timer: null, inFlight: false },
  okx: { attempts: 0, timer: null, inFlight: false },
  hyperliquid: { attempts: 0, timer: null, inFlight: false },
};
const controllers: Record<DomesticExchange, Record<OverseasExchange, AbortController | null>> = {
  bithumb: { gateio: null, bybit: null, okx: null, hyperliquid: null },
  upbit: { gateio: null, bybit: null, okx: null, hyperliquid: null },
};
const lastPayloads: Record<DomesticExchange, Record<OverseasExchange, WatchReverseTick | null>> = {
  bithumb: { gateio: null, bybit: null, okx: null, hyperliquid: null },
  upbit: { gateio: null, bybit: null, okx: null, hyperliquid: null },
};
const lastStatuses: Record<DomesticExchange, Record<OverseasExchange, WatchStatus | null>> = {
  bithumb: { gateio: null, bybit: null, okx: null, hyperliquid: null },
  upbit: { gateio: null, bybit: null, okx: null, hyperliquid: null },
};
const clientsByPair: Record<DomesticExchange, Record<OverseasExchange, Set<http.ServerResponse>>> = {
  bithumb: { gateio: new Set(), bybit: new Set(), okx: new Set(), hyperliquid: new Set() },
  upbit: { gateio: new Set(), bybit: new Set(), okx: new Set(), hyperliquid: new Set() },
};

async function buildSharedOverseasResources(overseas: OverseasExchange): Promise<SharedOverseasResources> {
  const gateSpot =
    overseas === "bybit"
      ? await createBybitSpot(false)
      : overseas === "okx"
        ? await createOkxSpot(false)
        : overseas === "hyperliquid"
          ? await createHyperliquidSpot(false)
          : await createGateioSpot(false, false);
  const gatePerp =
    overseas === "bybit"
      ? await createBybitPerp(false)
      : overseas === "okx"
        ? await createOkxPerp(false)
        : overseas === "hyperliquid"
          ? await createHyperliquidPerp(false)
          : await createGateioPerp(false, true);

  const [bSymbols, uSymbols, gateioSymbols] = await Promise.all([
    bithumbKrwSymbolsRest().catch((err) => {
      console.warn(`[WEB] Bithumb symbols unavailable: ${String(err)}`);
      return {};
    }),
    upbitKrwSymbolsRest().catch((err) => {
      console.warn(`[WEB] Upbit symbols unavailable: ${String(err)}`);
      return {};
    }),
    overseas === "bybit"
      ? bybitSpotAndPerpSymbols(gateSpot, gatePerp)
      : overseas === "okx"
        ? okxSpotAndPerpSymbols(gateSpot, gatePerp)
        : overseas === "hyperliquid"
          ? hyperliquidSpotAndPerpSymbols(gateSpot, gatePerp)
          : gateioSpotAndPerpSymbols(gateSpot, gatePerp),
  ]);

    const coins = new Set<string>();
    for (const coin of Object.keys(bSymbols)) {
      if (coin in gateioSymbols.perp) coins.add(coin);
    }
    for (const coin of Object.keys(uSymbols)) {
      if (coin in gateioSymbols.perp) coins.add(coin);
    }

    const perpIds = new Set<string>();
    const spotIds = new Set<string>();
    for (const coin of coins) {
      const perpSymbol = gateioSymbols.perp[coin];
      const perpMarket = (gatePerp as any).market?.(perpSymbol) ?? (gatePerp as any).markets?.[perpSymbol];
      const perpWsSymbol =
        overseas === "hyperliquid"
          ? String(perpMarket?.baseName ?? perpMarket?.base ?? "")
          : perpMarket?.id
            ? String(perpMarket.id)
            : "";
      if (perpWsSymbol) perpIds.add(perpWsSymbol);

      const spotSymbol = gateioSymbols.spot[coin];
      if (spotSymbol) {
        const spotMarket = (gateSpot as any).market?.(spotSymbol) ?? (gateSpot as any).markets?.[spotSymbol];
        if (spotMarket?.id) spotIds.add(String(spotMarket.id));
      }
    }

    const gatePerpWs = perpIds.size
      ? overseas === "bybit"
        ? new BybitPerpOrderbookWs([...perpIds])
        : overseas === "okx"
          ? new OkxPerpTickerWs([...perpIds])
          : overseas === "hyperliquid"
            ? new HyperliquidPerpOrderbookWs([...perpIds])
            : new GateioFuturesBookTickerWs([...perpIds])
      : undefined;
    const gateSpotWs = spotIds.size
      ? overseas === "bybit"
        ? new BybitSpotOrderbookWs([...spotIds])
        : overseas === "okx"
          ? new OkxSpotTickerWs([...spotIds])
          : overseas === "hyperliquid"
            ? new HyperliquidSpotOrderbookWs([...spotIds])
            : new GateioSpotTickerWs([...spotIds])
      : undefined;

  return { exchange: overseas, spot: gateSpot, perp: gatePerp, perpWs: gatePerpWs, spotWs: gateSpotWs };
}

async function ensureSharedOverseas(overseas: OverseasExchange): Promise<SharedOverseasResources> {
  const cached = sharedOverseas[overseas];
  if (cached) return cached;
  const created = await buildSharedOverseasResources(overseas);
  sharedOverseas[overseas] = created;
  return created;
}

async function buildSharedDomesticResources(domestic: DomesticExchange): Promise<SharedDomesticResources> {
  const symbols =
    domestic === "upbit" ? await upbitKrwSymbolsRest() : await bithumbKrwSymbolsRest();
  const symbolList = Object.values(symbols);
  if (!symbolList.length) throw new Error(`No ${domestic} symbols available for websocket feed.`);
  const ws = domestic === "upbit" ? new UpbitOrderbookWs(symbolList) : new BithumbOrderbookWs(symbolList);
  return { exchange: domestic, ws, symbols: symbolList };
}

async function ensureSharedDomestic(domestic: DomesticExchange): Promise<SharedDomesticResources> {
  const cached = sharedDomestic[domestic];
  if (cached) return cached;
  const created = await buildSharedDomesticResources(domestic);
  sharedDomestic[domestic] = created;
  return created;
}

function scheduleOverseasRetry(overseas: OverseasExchange, err: unknown): void {
  const state = overseasInitState[overseas];
  if (state.timer) return;
  state.attempts += 1;
  const delayMs = Math.min(300_000, 15_000 * Math.pow(2, state.attempts - 1));
  const message = `Failed to init ${overseas}: ${String(err)} | retrying in ${Math.round(delayMs / 1000)}s`;
  console.error(`[WEB] ${message}`);
  for (const domestic of DOMESTIC_EXCHANGES) {
    broadcastStatus(domestic, overseas, { phase: "error", message });
  }
  state.timer = setTimeout(() => {
    state.timer = null;
    void attemptStartOverseas(overseas);
  }, delayMs);
}

async function attemptStartOverseas(overseas: OverseasExchange): Promise<void> {
  const state = overseasInitState[overseas];
  if (state.inFlight) return;
  state.inFlight = true;
  try {
    const shared = await ensureSharedOverseas(overseas);
    state.attempts = 0;
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
    for (const domestic of DOMESTIC_EXCHANGES) {
      await startWatch(domestic, overseas, shared);
    }
  } catch (err) {
    scheduleOverseasRetry(overseas, err);
  } finally {
    state.inFlight = false;
  }
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const v = Math.trunc(n);
  return Math.max(min, Math.min(max, v));
}

function parseDomesticExchange(value: unknown, fallback: DomesticExchange): DomesticExchange {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (raw === "upbit") return "upbit";
  if (raw === "bithumb") return "bithumb";
  return fallback;
}

function parseOverseasExchange(value: unknown, fallback: OverseasExchange): OverseasExchange {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (raw === "bybit") return "bybit";
  if (raw === "okx") return "okx";
  if (raw === "hyperliquid") return "hyperliquid";
  if (raw === "gateio") return "gateio";
  return fallback;
}

function parseConfig(body: any): WatchConfig {
  const topN = clampInt(body?.topN, currentConfig.topN, 1, 50);
  const displayTopK = clampInt(body?.displayTopK, currentConfig.displayTopK, 1, topN);
  const displayFarK = clampInt(body?.displayFarK, currentConfig.displayFarK, 0, Math.max(0, topN - displayTopK));
  const intervalSec = clampInt(body?.intervalSec, currentConfig.intervalSec, 1, 60);
  const domesticExchange = parseDomesticExchange(body?.domesticExchange, currentConfig.domesticExchange);
  const overseasExchange = parseOverseasExchange(body?.overseasExchange, currentConfig.overseasExchange);
  return { topN, displayTopK, displayFarK, intervalSec, domesticExchange, overseasExchange };
}

function broadcast(domestic: DomesticExchange, overseas: OverseasExchange, payload: WatchReverseTick): void {
  lastPayloads[domestic][overseas] = payload;
  const data = `event: tick\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of clientsByPair[domestic][overseas]) {
    res.write(data);
  }
}

function broadcastStatus(domestic: DomesticExchange, overseas: OverseasExchange, status: WatchStatus): void {
  lastStatuses[domestic][overseas] = status;
  const data = `event: status\ndata: ${JSON.stringify(status)}\n\n`;
  for (const res of clientsByPair[domestic][overseas]) {
    res.write(data);
  }
}

async function startWatch(domestic: DomesticExchange, overseas: OverseasExchange, sharedOverseas: SharedOverseasResources): Promise<void> {
  if (controllers[domestic][overseas]) controllers[domestic][overseas]?.abort();
  const controller = new AbortController();
  controllers[domestic][overseas] = controller;
  broadcastStatus(domestic, overseas, { phase: "init", message: `Starting watch (${domestic}/${overseas})...` });
  let sharedDomesticResources: SharedDomesticResources | undefined;
  try {
    sharedDomesticResources = await ensureSharedDomestic(domestic);
  } catch (err) {
    console.warn(`[WEB] Failed to init shared ${domestic} websocket: ${String(err)}`);
  }
  watchReverseTopN(
    {
      ...currentConfig,
      domesticExchange: domestic,
      overseasExchange: overseas,
      fullUniverse: true,
      useWebsocket: true,
      sharedOverseas,
      sharedDomestic: sharedDomesticResources,
    },
    {
      onTick: (payload) => broadcast(domestic, overseas, payload),
      onStatus: (status) => broadcastStatus(domestic, overseas, status),
      silent: true,
      signal: controller.signal,
    },
  ).catch((err) => {
    console.error(`[WEB] watch failed (${domestic}/${overseas}): ${String(err)}`);
    broadcastStatus(domestic, overseas, { phase: "error", message: `watch failed (${domestic}/${overseas}): ${String(err)}` });
  });
}

async function startAllWatches(): Promise<void> {
  for (const overseas of OVERSEAS_EXCHANGES) {
    await attemptStartOverseas(overseas);
  }
}

function sendJson(res: http.ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}

async function readBody(req: http.IncomingMessage): Promise<any> {
  return await new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

async function serveStatic(res: http.ServerResponse, filePath: string): Promise<void> {
  try {
    const content = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    const type =
      ext === ".html"
        ? "text/html"
        : ext === ".js"
          ? "text/javascript"
          : ext === ".css"
            ? "text/css"
            : "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/api/watch") {
    const domestic = parseDomesticExchange(
      url.searchParams.get("domestic") ?? url.searchParams.get("domesticExchange"),
      currentConfig.domesticExchange,
    );
    const overseas = parseOverseasExchange(
      url.searchParams.get("overseas") ?? url.searchParams.get("overseasExchange"),
      currentConfig.overseasExchange,
    );
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`);
    const lastPayload = lastPayloads[domestic][overseas];
    const lastStatus = lastStatuses[domestic][overseas];
    if (lastPayload) res.write(`event: tick\ndata: ${JSON.stringify(lastPayload)}\n\n`);
    if (lastStatus) res.write(`event: status\ndata: ${JSON.stringify(lastStatus)}\n\n`);
    clientsByPair[domestic][overseas].add(res);
    req.on("close", () => {
      clientsByPair[domestic][overseas].delete(res);
    });
    return;
  }

  if (url.pathname === "/api/config") {
    if (req.method === "GET") {
      sendJson(res, 200, currentConfig);
      return;
    }
    if (req.method === "POST") {
      try {
        const body = await readBody(req);
        currentConfig = parseConfig(body);
        for (const domestic of DOMESTIC_EXCHANGES) {
          for (const overseas of OVERSEAS_EXCHANGES) {
            broadcastStatus(domestic, overseas, { phase: "init", message: "Config applied. Restarting watch..." });
          }
        }
        await startAllWatches();
        sendJson(res, 200, currentConfig);
      } catch (err) {
        sendJson(res, 400, { error: String(err) });
      }
      return;
    }
    res.writeHead(405);
    res.end();
    return;
  }

  if (url.pathname === "/" || url.pathname === "/index.html") {
    await serveStatic(res, path.join(publicDir, "index.html"));
    return;
  }
  if (url.pathname === "/app.js") {
    await serveStatic(res, path.join(publicDir, "app.js"));
    return;
  }
  if (url.pathname === "/styles.css") {
    await serveStatic(res, path.join(publicDir, "styles.css"));
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

setInterval(() => {
  for (const domesticGroup of Object.values(clientsByPair)) {
    for (const group of Object.values(domesticGroup)) {
      for (const res of group) res.write(`: ping ${Date.now()}\n\n`);
    }
  }
}, 15000);

startAllWatches()
  .then(() => {
    server.listen(PORT, () => {
      console.info(`[WEB] http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error(`[WEB] failed to start: ${String(err)}`);
    process.exitCode = 1;
  });
