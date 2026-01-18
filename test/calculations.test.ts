import { describe, expect, it } from "vitest";
import { applyFee, basisPct, midPrice, premiumPct } from "../src/calculations";

describe("calculations", () => {
  describe("premiumPct", () => {
    it("premiumPct positive", () => {
      expect(premiumPct(105.0, 1.0, 100.0)).toBeCloseTo(5.0);
    });

    it("premiumPct negative", () => {
      expect(premiumPct(95.0, 1.0, 100.0)).toBeCloseTo(-5.0);
    });

    it("premiumPct invalid", () => {
      expect(() => premiumPct(0.0, 1.0, 100.0)).toThrow();
    });

    // Real-world scenario: BTC kimchi premium
    it("premiumPct realistic BTC scenario", () => {
      // Korean exchange: 150,000,000 KRW
      // Overseas: 100,000 USDT
      // USDT/KRW: 1,450
      // Overseas KRW = 100,000 * 1,450 = 145,000,000
      // Premium = (150M - 145M) / 145M * 100 = 3.448%
      const domesticKrw = 150_000_000;
      const overseasUsdt = 100_000;
      const usdtKrw = 1_450;
      const expectedPremium = ((domesticKrw - overseasUsdt * usdtKrw) / (overseasUsdt * usdtKrw)) * 100;

      expect(premiumPct(domesticKrw, overseasUsdt, usdtKrw)).toBeCloseTo(expectedPremium);
      expect(premiumPct(domesticKrw, overseasUsdt, usdtKrw)).toBeCloseTo(3.448, 2);
    });

    // Verify formula: premium = (domestic - overseas_krw) / overseas_krw * 100
    it("premiumPct formula verification", () => {
      const domestic = 1000;
      const overseas = 10;
      const rate = 90;
      // overseas_krw = 10 * 90 = 900
      // premium = (1000 - 900) / 900 * 100 = 11.111%
      expect(premiumPct(domestic, overseas, rate)).toBeCloseTo(11.111, 2);
    });

    // Zero premium case
    it("premiumPct zero when prices equal", () => {
      expect(premiumPct(1450, 1, 1450)).toBeCloseTo(0);
    });
  });

  describe("applyFee", () => {
    it("applyFee buy/sell", () => {
      expect(applyFee(100.0, 0.001, "buy")).toBeCloseTo(100.1);
      expect(applyFee(100.0, 0.001, "sell")).toBeCloseTo(99.9);
    });

    // Realistic exchange fees
    it("applyFee with typical exchange fees", () => {
      const price = 100_000;
      // Bithumb maker fee: 0.04%
      expect(applyFee(price, 0.0004, "buy")).toBeCloseTo(100_040);
      expect(applyFee(price, 0.0004, "sell")).toBeCloseTo(99_960);

      // Gate.io taker fee: 0.075%
      expect(applyFee(price, 0.00075, "buy")).toBeCloseTo(100_075);
      expect(applyFee(price, 0.00075, "sell")).toBeCloseTo(99_925);
    });

    // Compound fee calculation (buying and then selling)
    it("applyFee round-trip cost", () => {
      const price = 100_000;
      const feeRate = 0.001; // 0.1%
      const buyPrice = applyFee(price, feeRate, "buy"); // 100,100
      const sellPrice = applyFee(price, feeRate, "sell"); // 99,900
      // Round-trip cost = (100,100 - 99,900) / 100,000 * 100 = 0.2%
      const roundTripCost = ((buyPrice - sellPrice) / price) * 100;
      expect(roundTripCost).toBeCloseTo(0.2);
    });
  });

  describe("basisPct", () => {
    it("basisPct", () => {
      expect(basisPct(100.0, 110.0)).toBeCloseTo(10.0);
    });

    // Contango scenario (perp > spot)
    it("basisPct contango scenario", () => {
      const spot = 100_000;
      const perp = 100_500; // 0.5% contango
      expect(basisPct(spot, perp)).toBeCloseTo(0.5);
    });

    // Backwardation scenario (perp < spot)
    it("basisPct backwardation scenario", () => {
      const spot = 100_000;
      const perp = 99_500; // 0.5% backwardation
      expect(basisPct(spot, perp)).toBeCloseTo(0.5);
    });
  });

  describe("midPrice", () => {
    it("midPrice", () => {
      expect(midPrice(99.0, 101.0)).toBeCloseTo(100.0);
      expect(midPrice(99.0, 0.0)).toBeCloseTo(99.0);
    });

    it("midPrice with realistic spread", () => {
      // Typical BTC spread
      const bid = 100_000;
      const ask = 100_050;
      expect(midPrice(bid, ask)).toBeCloseTo(100_025);
    });

    it("midPrice fallback when one side missing", () => {
      expect(midPrice(100, 0)).toBe(100);
      expect(midPrice(0, 100)).toBe(100);
      expect(midPrice(0, 0)).toBe(0);
    });
  });
});

