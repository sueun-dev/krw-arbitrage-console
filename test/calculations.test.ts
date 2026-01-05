import { describe, expect, it } from "vitest";
import { applyFee, basisPct, midPrice, premiumPct } from "../src/calculations";

describe("calculations", () => {
  it("premiumPct positive", () => {
    expect(premiumPct(105.0, 1.0, 100.0)).toBeCloseTo(5.0);
  });

  it("premiumPct negative", () => {
    expect(premiumPct(95.0, 1.0, 100.0)).toBeCloseTo(-5.0);
  });

  it("premiumPct invalid", () => {
    expect(() => premiumPct(0.0, 1.0, 100.0)).toThrow();
  });

  it("applyFee buy/sell", () => {
    expect(applyFee(100.0, 0.001, "buy")).toBeCloseTo(100.1);
    expect(applyFee(100.0, 0.001, "sell")).toBeCloseTo(99.9);
  });

  it("basisPct", () => {
    expect(basisPct(100.0, 110.0)).toBeCloseTo(10.0);
  });

  it("midPrice", () => {
    expect(midPrice(99.0, 101.0)).toBeCloseTo(100.0);
    expect(midPrice(99.0, 0.0)).toBeCloseTo(99.0);
  });
});

