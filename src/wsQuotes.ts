import { MarketQuote } from "./models";

const DEFAULT_STALE_MS = 10_000;
const DEFAULT_BITHUMB_DEPTH = 5;
const DEFAULT_WS_BATCH = 100;
const DEFAULT_UPBIT_BATCH = 100;
const DEFAULT_BYBIT_BATCH = 10;
const DEFAULT_OKX_BATCH = 20;
const DEFAULT_HYPERLIQUID_BATCH = 50;
const DEFAULT_LIGHTER_BATCH = 50;
const GATEIO_SPOT_URL = "wss://api.gateio.ws/ws/v4/";
const GATEIO_FUTURES_URL = "wss://fx-ws.gateio.ws/v4/ws/usdt";
const BITHUMB_URL = "wss://pubwss.bithumb.com/pub/ws";
const UPBIT_URL = "wss://api.upbit.com/websocket/v1";
const BYBIT_SPOT_URL = "wss://stream.bybit.com/v5/public/spot";
const BYBIT_LINEAR_URL = "wss://stream.bybit.com/v5/public/linear";
const OKX_PUBLIC_URL = "wss://ws.okx.com:8443/ws/v5/public";
const HYPERLIQUID_URL = "wss://api.hyperliquid.xyz/ws";
const LIGHTER_URL = "wss://mainnet.zklighter.elliot.ai/stream";

function parseJsonMessage(data: unknown): any | null {
  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  if (data instanceof ArrayBuffer) {
    try {
      return JSON.parse(Buffer.from(data).toString("utf8"));
    } catch {
      return null;
    }
  }

  if (ArrayBuffer.isView(data)) {
    try {
      const view = data as ArrayBufferView;
      return JSON.parse(Buffer.from(view.buffer, view.byteOffset, view.byteLength).toString("utf8"));
    } catch {
      return null;
    }
  }

  return null;
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.filter((v) => typeof v === "string" && v.trim().length)));
}

function chunk<T>(values: T[], size: number): T[][] {
  if (size <= 0) return [values];
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type WsHandlers = {
  name: string;
  onOpen?: () => void;
  onMessage: (message: any) => void;
};

class ReconnectingWebSocket {
  private wsCtor: typeof WebSocket;
  private ws: WebSocket | null = null;
  private pending: string[] = [];
  private reconnectTimer: NodeJS.Timeout | null = null;
  private closed = false;
  private attempts = 0;

  constructor(
    private url: string,
    private handlers: WsHandlers,
  ) {
    const ctor = (globalThis as any).WebSocket as typeof WebSocket | undefined;
    if (!ctor) throw new Error("WebSocket is not available in this runtime. Use Node 18+ or install ws.");
    this.wsCtor = ctor;
  }

  connect(): void {
    if (this.closed) return;
    const ws = new this.wsCtor(this.url);
    this.ws = ws;
    try {
      (ws as any).binaryType = "arraybuffer";
    } catch {
      // Some runtimes may not support setting binaryType.
    }

    ws.onopen = () => {
      this.attempts = 0;
      this.flush();
      this.handlers.onOpen?.();
    };

    ws.onmessage = (event) => {
      const raw = (event as MessageEvent).data;
      if (typeof raw === "string" && raw === "ping") {
        this.send("pong");
        return;
      }
      const parsed = parseJsonMessage(raw);
      if (parsed != null) {
        this.handlers.onMessage(parsed);
        return;
      }
      if (typeof Blob !== "undefined" && raw instanceof Blob) {
        raw
          .text()
          .then((text) => {
            try {
              this.handlers.onMessage(JSON.parse(text));
            } catch {
              // ignore
            }
          })
          .catch(() => {
            // ignore
          });
      }
    };

    ws.onerror = () => {
      // Allow close handler to trigger reconnection.
    };

    ws.onclose = () => {
      this.ws = null;
      if (this.closed) return;
      this.scheduleReconnect();
    };
  }

  send(payload: unknown): void {
    const encoded = typeof payload === "string" ? payload : JSON.stringify(payload);
    if (this.ws && this.ws.readyState === this.wsCtor.OPEN) {
      this.ws.send(encoded);
      return;
    }
    this.pending.push(encoded);
  }

  close(): void {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
    }
    this.ws = null;
  }

  private flush(): void {
    if (!this.ws || this.ws.readyState !== this.wsCtor.OPEN) return;
    for (const message of this.pending) this.ws.send(message);
    this.pending = [];
  }

  private scheduleReconnect(): void {
    const delay = Math.min(30_000, 1000 * Math.pow(2, this.attempts));
    this.attempts += 1;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }
}

class QuoteCache {
  protected quotes = new Map<string, MarketQuote>();
  protected updatedAt = new Map<string, number>();

  constructor(private staleMs: number) {}

  protected setQuote(symbol: string, quote: MarketQuote): void {
    this.quotes.set(symbol, quote);
    this.updatedAt.set(symbol, Date.now());
  }

  getQuote(symbol: string): MarketQuote | undefined {
    const updated = this.updatedAt.get(symbol);
    if (!updated) return undefined;
    if (Date.now() - updated > this.staleMs) return undefined;
    return this.quotes.get(symbol);
  }

  getCoverage(symbols: string[]): number {
    let count = 0;
    for (const symbol of symbols) if (this.getQuote(symbol)) count += 1;
    return count;
  }

  async waitForSymbols(symbols: string[], timeoutMs = 5000): Promise<void> {
    const list = uniq(symbols);
    if (!list.length) return;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.getCoverage(list) === list.length) return;
      await sleep(50);
    }
  }
}

export class BithumbOrderbookWs extends QuoteCache {
  private sockets: ReconnectingWebSocket[] = [];
  private symbols: string[];
  private depth: number;
  private books = new Map<string, { bids: Map<number, number>; asks: Map<number, number> }>();
  // Map from underscore format (FLOW_KRW) to original format (FLOW/KRW)
  private symbolMap = new Map<string, string>();

  constructor(symbols: string[], depth = DEFAULT_BITHUMB_DEPTH, staleMs = DEFAULT_STALE_MS) {
    super(staleMs);
    this.symbols = uniq(symbols);
    this.depth = depth;
    // Build symbol mapping: FLOW/KRW -> FLOW_KRW and reverse lookup
    for (const sym of this.symbols) {
      const wsSymbol = sym.replace("/", "_");
      this.symbolMap.set(wsSymbol, sym);
    }
    this.connect();
  }

  close(): void {
    for (const ws of this.sockets) ws.close();
    this.sockets = [];
  }

  private connect(): void {
    if (!this.symbols.length) return;
    for (const batch of chunk(this.symbols, DEFAULT_WS_BATCH)) {
      let client: ReconnectingWebSocket;
      client = new ReconnectingWebSocket(BITHUMB_URL, {
        name: "bithumb",
        onOpen: () => this.subscribe(client, batch),
        onMessage: (msg) => this.handleMessage(msg),
      });
      this.sockets.push(client);
      client.connect();
    }
  }

  private subscribe(ws: ReconnectingWebSocket, batch: string[]): void {
    if (!batch.length) return;
    // Convert to underscore format for Bithumb WS: FLOW/KRW -> FLOW_KRW
    const wsSymbols = batch.map((s) => s.replace("/", "_"));
    ws.send({ type: "orderbookdepth", symbols: wsSymbols, depth: this.depth });
  }

  private handleMessage(message: any): void {
    if (message?.type !== "orderbookdepth") return;
    const list = Array.isArray(message?.content?.list) ? message.content.list : [];
    if (!list.length) return;

    const grouped = new Map<string, { bids: Map<number, number>; asks: Map<number, number> }>();
    for (const entry of list) {
      const symbol = typeof entry?.symbol === "string" ? entry.symbol : "";
      if (!symbol) continue;
      const price = Number(entry?.price ?? 0);
      const qty = Number(entry?.quantity ?? 0);
      if (!Number.isFinite(price) || price <= 0) continue;
      let book = grouped.get(symbol);
      if (!book) {
        book = { bids: new Map<number, number>(), asks: new Map<number, number>() };
        grouped.set(symbol, book);
      }
      if (entry?.orderType === "bid") {
        if (qty > 0) book.bids.set(price, qty);
      } else if (entry?.orderType === "ask") {
        if (qty > 0) book.asks.set(price, qty);
      }
    }

    for (const [wsSymbol, book] of grouped) {
      this.books.set(wsSymbol, book);
      let bid = 0;
      for (const price of book.bids.keys()) bid = Math.max(bid, price);
      let ask = 0;
      for (const price of book.asks.keys()) ask = ask > 0 ? Math.min(ask, price) : price;
      if (bid > 0 && ask > 0) {
        // Convert back to slash format: FLOW_KRW -> FLOW/KRW
        const originalSymbol = this.symbolMap.get(wsSymbol) ?? wsSymbol;
        this.setQuote(originalSymbol, { bid, ask });
      }
    }
  }
}

export class UpbitOrderbookWs extends QuoteCache {
  private sockets: ReconnectingWebSocket[] = [];
  private symbols: string[];

  constructor(symbols: string[], staleMs = DEFAULT_STALE_MS) {
    super(staleMs);
    this.symbols = uniq(symbols);
    this.connect();
  }

  close(): void {
    for (const ws of this.sockets) ws.close();
    this.sockets = [];
  }

  private connect(): void {
    if (!this.symbols.length) return;
    for (const batch of chunk(this.symbols, DEFAULT_UPBIT_BATCH)) {
      let client: ReconnectingWebSocket;
      client = new ReconnectingWebSocket(UPBIT_URL, {
        name: "upbit",
        onOpen: () => this.subscribe(client, batch),
        onMessage: (msg) => this.handleMessage(msg),
      });
      this.sockets.push(client);
      client.connect();
    }
  }

  private subscribe(ws: ReconnectingWebSocket, batch: string[]): void {
    if (!batch.length) return;
    const payload = [
      { ticket: `arb-${Math.random().toString(36).slice(2, 8)}` },
      { type: "orderbook", codes: batch, isOnlyRealtime: true },
    ];
    ws.send(payload);
  }

  private handleMessage(message: any): void {
    if (message?.type !== "orderbook") return;
    const code = typeof message?.code === "string" ? message.code : "";
    if (!code) return;
    const units = Array.isArray(message?.orderbook_units) ? message.orderbook_units : [];
    if (!units.length) return;
    const best = units[0];
    const bid = Number(best?.bid_price ?? 0);
    const ask = Number(best?.ask_price ?? 0);
    if (bid > 0 && ask > 0) this.setQuote(code, { bid, ask });
  }
}

class BybitOrderbookWs extends QuoteCache {
  private ws: ReconnectingWebSocket;
  private symbols: string[];
  private url: string;

  constructor(url: string, symbols: string[], staleMs = DEFAULT_STALE_MS) {
    super(staleMs);
    this.url = url;
    this.symbols = uniq(symbols);
    this.ws = new ReconnectingWebSocket(this.url, {
      name: "bybit",
      onOpen: () => this.subscribe(),
      onMessage: (msg) => this.handleMessage(msg),
    });
    this.ws.connect();
  }

  close(): void {
    this.ws.close();
  }

  private subscribe(): void {
    if (!this.symbols.length) return;
    for (const batch of chunk(this.symbols, DEFAULT_BYBIT_BATCH)) {
      const topics = batch.map((symbol) => `orderbook.1.${symbol}`);
      this.ws.send({ op: "subscribe", args: topics });
    }
  }

  private handleMessage(message: any): void {
    if (message?.op === "ping") {
      this.ws.send({ op: "pong" });
      return;
    }
    const topic = typeof message?.topic === "string" ? message.topic : "";
    if (!topic.startsWith("orderbook.")) return;
    const data = message?.data;
    const symbol = typeof data?.s === "string" ? data.s : topic.split(".").pop() ?? "";
    if (!symbol) return;
    const bid = Number(data?.b?.[0]?.[0] ?? 0);
    const ask = Number(data?.a?.[0]?.[0] ?? 0);
    const existing = this.getQuote(symbol);
    const nextBid = bid > 0 ? bid : existing?.bid ?? 0;
    const nextAsk = ask > 0 ? ask : existing?.ask ?? 0;
    if (nextBid > 0 && nextAsk > 0) this.setQuote(symbol, { bid: nextBid, ask: nextAsk });
  }
}

export class BybitSpotOrderbookWs extends BybitOrderbookWs {
  constructor(symbols: string[], staleMs = DEFAULT_STALE_MS) {
    super(BYBIT_SPOT_URL, symbols, staleMs);
  }
}

export class BybitPerpOrderbookWs extends BybitOrderbookWs {
  constructor(symbols: string[], staleMs = DEFAULT_STALE_MS) {
    super(BYBIT_LINEAR_URL, symbols, staleMs);
  }
}

class OkxTickerWs extends QuoteCache {
  private ws: ReconnectingWebSocket;
  private symbols: string[];

  constructor(symbols: string[], staleMs = DEFAULT_STALE_MS) {
    super(staleMs);
    this.symbols = uniq(symbols);
    this.ws = new ReconnectingWebSocket(OKX_PUBLIC_URL, {
      name: "okx",
      onOpen: () => this.subscribe(),
      onMessage: (msg) => this.handleMessage(msg),
    });
    this.ws.connect();
  }

  close(): void {
    this.ws.close();
  }

  private subscribe(): void {
    if (!this.symbols.length) return;
    for (const batch of chunk(this.symbols, DEFAULT_OKX_BATCH)) {
      this.ws.send({ op: "subscribe", args: batch.map((instId) => ({ channel: "tickers", instId })) });
    }
  }

  private handleMessage(message: any): void {
    if (message === "pong") return;
    if (message?.event === "error") return;
    if (message?.event === "subscribe") return;
    const data = Array.isArray(message?.data) ? message.data : [];
    if (!data.length) return;
    for (const item of data) {
      const symbol = typeof item?.instId === "string" ? item.instId : "";
      if (!symbol) continue;
      const bid = Number(item?.bidPx ?? 0);
      const ask = Number(item?.askPx ?? 0);
      if (bid > 0 && ask > 0) this.setQuote(symbol, { bid, ask });
    }
  }
}

export class OkxSpotTickerWs extends OkxTickerWs {}
export class OkxPerpTickerWs extends OkxTickerWs {}

export class GateioSpotTickerWs extends QuoteCache {
  private ws: ReconnectingWebSocket;
  private symbols: string[];

  constructor(symbols: string[], staleMs = DEFAULT_STALE_MS) {
    super(staleMs);
    this.symbols = uniq(symbols);
    this.ws = new ReconnectingWebSocket(GATEIO_SPOT_URL, {
      name: "gateio-spot",
      onOpen: () => this.subscribe(),
      onMessage: (msg) => this.handleMessage(msg),
    });
    this.ws.connect();
  }

  close(): void {
    this.ws.close();
  }

  private subscribe(): void {
    if (!this.symbols.length) return;
    for (const batch of chunk(this.symbols, DEFAULT_WS_BATCH)) {
      this.ws.send({ time: nowSec(), channel: "spot.tickers", event: "subscribe", payload: batch });
    }
  }

  private handleMessage(message: any): void {
    if (message?.event === "ping") {
      this.ws.send({ event: "pong", time: message?.time ?? nowSec() });
      return;
    }
    if (message?.event !== "update" || message?.channel !== "spot.tickers") return;
    const items = Array.isArray(message?.result) ? message.result : [message.result];
    for (const item of items) {
      const symbol = typeof item?.currency_pair === "string" ? item.currency_pair : "";
      if (!symbol) continue;
      const bid = Number(item?.highest_bid ?? 0);
      const ask = Number(item?.lowest_ask ?? 0);
      if (bid > 0 && ask > 0) this.setQuote(symbol, { bid, ask });
    }
  }
}

export class GateioFuturesBookTickerWs extends QuoteCache {
  private ws: ReconnectingWebSocket;
  private symbols: string[];

  constructor(symbols: string[], staleMs = DEFAULT_STALE_MS) {
    super(staleMs);
    this.symbols = uniq(symbols);
    this.ws = new ReconnectingWebSocket(GATEIO_FUTURES_URL, {
      name: "gateio-futures",
      onOpen: () => this.subscribe(),
      onMessage: (msg) => this.handleMessage(msg),
    });
    this.ws.connect();
  }

  close(): void {
    this.ws.close();
  }

  private subscribe(): void {
    if (!this.symbols.length) return;
    for (const batch of chunk(this.symbols, DEFAULT_WS_BATCH)) {
      this.ws.send({ time: nowSec(), channel: "futures.book_ticker", event: "subscribe", payload: batch });
    }
  }

  private handleMessage(message: any): void {
    if (message?.event === "ping") {
      this.ws.send({ event: "pong", time: message?.time ?? nowSec() });
      return;
    }
    if (message?.event !== "update" || message?.channel !== "futures.book_ticker") return;
    const items = Array.isArray(message?.result) ? message.result : [message.result];
    for (const item of items) {
      const symbol = typeof item?.s === "string" ? item.s : "";
      if (!symbol) continue;
      const bid = Number(item?.b ?? 0);
      const ask = Number(item?.a ?? 0);
      if (bid > 0 && ask > 0) this.setQuote(symbol, { bid, ask });
    }
  }
}

class LighterOrderbookWs extends QuoteCache {
  private sockets: ReconnectingWebSocket[] = [];
  private symbols: string[];
  private books = new Map<string, { bids: Map<number, number>; asks: Map<number, number>; initialized: boolean }>();

  constructor(symbols: string[], staleMs = DEFAULT_STALE_MS) {
    super(staleMs);
    this.symbols = uniq(symbols);
    this.connect();
  }

  close(): void {
    for (const ws of this.sockets) ws.close();
    this.sockets = [];
  }

  private connect(): void {
    if (!this.symbols.length) return;
    for (const batch of chunk(this.symbols, DEFAULT_LIGHTER_BATCH)) {
      let client: ReconnectingWebSocket;
      client = new ReconnectingWebSocket(LIGHTER_URL, {
        name: "lighter",
        onOpen: () => this.subscribe(client, batch),
        onMessage: (msg) => this.handleMessage(msg),
      });
      this.sockets.push(client);
      client.connect();
    }
  }

  private subscribe(ws: ReconnectingWebSocket, batch: string[]): void {
    if (!batch.length) return;
    for (const marketId of batch) {
      ws.send({ type: "subscribe", channel: `order_book/${marketId}` });
    }
  }

  private parseLevel(level: any): { price: number; size: number } | null {
    const price = Number(level?.price ?? level?.[0] ?? 0);
    const size = Number(level?.size ?? level?.[1] ?? 0);
    if (!Number.isFinite(price) || !Number.isFinite(size)) return null;
    return { price, size };
  }

  private applyLevels(target: Map<number, number>, levels: any[]): void {
    for (const level of levels) {
      const parsed = this.parseLevel(level);
      if (!parsed) continue;
      if (parsed.size > 0) target.set(parsed.price, parsed.size);
      else target.delete(parsed.price);
    }
  }

  private handleMessage(message: any): void {
    const channel = typeof message?.channel === "string" ? message.channel : "";
    if (!channel) return;
    const symbol = channel.startsWith("order_book:")
      ? channel.slice("order_book:".length)
      : channel.startsWith("order_book/")
        ? channel.slice("order_book/".length)
        : "";
    if (!symbol) return;
    const payload = message?.order_book;
    if (!payload || typeof payload !== "object") return;

    const bids = Array.isArray(payload?.bids) ? payload.bids : [];
    const asks = Array.isArray(payload?.asks) ? payload.asks : [];
    let book = this.books.get(symbol);
    if (!book) {
      book = { bids: new Map(), asks: new Map(), initialized: false };
      this.books.set(symbol, book);
    }
    const messageType = typeof message?.type === "string" ? message.type : "";
    if (!book.initialized || messageType.includes("snapshot")) {
      book.bids.clear();
      book.asks.clear();
      book.initialized = true;
    }

    this.applyLevels(book.bids, bids);
    this.applyLevels(book.asks, asks);

    let bestBid = 0;
    for (const price of book.bids.keys()) {
      if (price > bestBid) bestBid = price;
    }
    let bestAsk = 0;
    for (const price of book.asks.keys()) {
      if (price > 0) bestAsk = bestAsk > 0 ? Math.min(bestAsk, price) : price;
    }
    if (bestBid > 0 && bestAsk > 0) this.setQuote(symbol, { bid: bestBid, ask: bestAsk });
  }
}

export class LighterSpotOrderbookWs extends LighterOrderbookWs {}
export class LighterPerpOrderbookWs extends LighterOrderbookWs {}

class HyperliquidOrderbookWs extends QuoteCache {
  private sockets: ReconnectingWebSocket[] = [];
  private symbols: string[];

  constructor(symbols: string[], staleMs = DEFAULT_STALE_MS) {
    super(staleMs);
    this.symbols = uniq(symbols);
    this.connect();
  }

  close(): void {
    for (const ws of this.sockets) ws.close();
    this.sockets = [];
  }

  private connect(): void {
    if (!this.symbols.length) return;
    for (const batch of chunk(this.symbols, DEFAULT_HYPERLIQUID_BATCH)) {
      let client: ReconnectingWebSocket;
      client = new ReconnectingWebSocket(HYPERLIQUID_URL, {
        name: "hyperliquid",
        onOpen: () => this.subscribe(client, batch),
        onMessage: (msg) => this.handleMessage(msg),
      });
      this.sockets.push(client);
      client.connect();
    }
  }

  private subscribe(ws: ReconnectingWebSocket, batch: string[]): void {
    if (!batch.length) return;
    for (const coin of batch) {
      ws.send({ method: "subscribe", subscription: { type: "l2Book", coin } });
    }
  }

  private handleMessage(message: any): void {
    if (message?.channel !== "l2Book") return;
    const data = message?.data ?? {};
    const coin = typeof data?.coin === "string" ? data.coin : "";
    if (!coin) return;
    const levels = Array.isArray(data?.levels) ? data.levels : [];
    const bids = Array.isArray(levels[0]) ? levels[0] : [];
    const asks = Array.isArray(levels[1]) ? levels[1] : [];
    let bid = 0;
    for (const level of bids) {
      const price = Number(level?.px ?? level?.[0] ?? 0);
      if (price > bid) bid = price;
    }
    let ask = 0;
    for (const level of asks) {
      const price = Number(level?.px ?? level?.[0] ?? 0);
      if (price > 0) ask = ask > 0 ? Math.min(ask, price) : price;
    }
    if (bid > 0 && ask > 0) this.setQuote(coin, { bid, ask });
  }
}

export class HyperliquidSpotOrderbookWs extends HyperliquidOrderbookWs {}
export class HyperliquidPerpOrderbookWs extends HyperliquidOrderbookWs {}
