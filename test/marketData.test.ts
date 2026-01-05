import { describe, expect, it } from "vitest";
import { feeAdjustedQuote, quoteAndSizeFromNotional } from "../src/marketData";

class StubExchange {
  constructor(private orderbook: any) {}
  async fetchOrderBook(_symbol: string, _limit?: number) {
    return this.orderbook;
  }
}

describe("marketData", () => {
  it("feeAdjustedQuote", () => {
    const quote = { bid: 100.0, ask: 110.0 };
    const adjusted = feeAdjustedQuote(quote, 0.01, 0.02);
    expect(adjusted.bid).toBeCloseTo(98.0);
    expect(adjusted.ask).toBeCloseTo(111.1);
  });

  it("quoteAndSizeFromNotional buy", async () => {
    const orderbook = { bids: [[10.0, 1.0], [9.0, 2.0]], asks: [[10.0, 1.0], [11.0, 2.0]] };
    const ex: any = new StubExchange(orderbook);
    const result = await quoteAndSizeFromNotional(ex, "FOO/USDT", 21.0, "buy", 5);
    expect(result).not.toBeNull();
    expect(result?.baseQty).toBeCloseTo(2.0);
    expect(result?.quote.ask).toBeGreaterThan(0);
  });

  it("quoteAndSizeFromNotional sell", async () => {
    const orderbook = { bids: [[10.0, 1.0], [9.0, 2.0]], asks: [[11.0, 1.0], [12.0, 2.0]] };
    const ex: any = new StubExchange(orderbook);
    const result = await quoteAndSizeFromNotional(ex, "FOO/USDT", 19.0, "sell", 5);
    expect(result).not.toBeNull();
    expect(result?.baseQty).toBeCloseTo(2.0);
    expect(result?.quote.bid).toBeGreaterThan(0);
  });
});

