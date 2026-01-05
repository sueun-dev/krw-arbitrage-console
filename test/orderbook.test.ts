import { describe, expect, it } from "vitest";
import {
  analyzeBuyFillFromQuote,
  analyzeSellFillFromBase,
  estimateFillFromBase,
  estimateFillFromQuote,
  quoteFromOrderbook,
} from "../src/orderbook";

describe("orderbook", () => {
  it("estimateFillFromBase", () => {
    const levels = [
      [10.0, 1.0],
      [11.0, 2.0],
    ];
    expect(estimateFillFromBase(levels, 2.5)).toBeCloseTo(10.6);
  });

  it("estimateFillFromBase insufficient", () => {
    const levels = [[10.0, 1.0]];
    expect(estimateFillFromBase(levels, 2.0)).toBeNull();
  });

  it("estimateFillFromQuote", () => {
    const levels = [
      [10.0, 1.0],
      [11.0, 2.0],
    ];
    const result = estimateFillFromQuote(levels, 21.0);
    expect(result).not.toBeNull();
    expect(result?.baseQty).toBeCloseTo(2.0);
    expect(result?.price).toBeCloseTo(10.5);
  });

  it("quoteFromOrderbook", () => {
    const orderbook = {
      bids: [
        [10.0, 1.0],
        [9.0, 2.0],
      ],
      asks: [
        [11.0, 1.0],
        [12.0, 2.0],
      ],
    };
    const quote = quoteFromOrderbook(orderbook, 2.0);
    expect(quote).not.toBeNull();
    expect(quote?.bid).toBeCloseTo(9.5);
    expect(quote?.ask).toBeCloseTo(11.5);
  });

  it("analyze buy fill + capacity", () => {
    const asks = [
      [100.0, 1.0],
      [100.1, 1.0],
      [100.3, 1.0],
    ];
    const fill = analyzeBuyFillFromQuote(asks, 150.0); // should consume 1 @100 and 0.5 @100.1
    expect(fill).not.toBeNull();
    expect(fill?.baseQty).toBeCloseTo(1.4995004995, 8);
    expect(fill?.worstPrice).toBeCloseTo(100.1);
    expect(fill?.impactPct).toBeGreaterThan(0);
  });

  it("analyze sell fill + capacity", () => {
    const bids = [
      [100.0, 1.0],
      [99.9, 2.0],
      [99.5, 10.0],
    ];
    const fill = analyzeSellFillFromBase(bids, 2.5);
    expect(fill).not.toBeNull();
    expect(fill?.quoteQty).toBeCloseTo(100.0 * 1.0 + 99.9 * 1.5);
    expect(fill?.worstPrice).toBeCloseTo(99.9);
  });
});
