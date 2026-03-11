import { describe, expect, it } from "vitest";
import { applyFee, basisPct, midPrice, premiumPct } from "../src/calculations";
import { commonChainPairs, normalizeChainName } from "../src/chains";
import { isCcxtDexExchange, isDexExchange } from "../src/exchangeClients";
import { getRoundTripFee } from "../src/fees";
import { isValidQuote } from "../src/models";
import { quoteFromOrderbook } from "../src/orderbook";
import {
  applyFee as nextApplyFee,
  basisPct as nextBasisPct,
  midPrice as nextMidPrice,
  premiumPct as nextPremiumPct,
} from "../src/rates/calculations";
import { commonChainPairs as nextCommonChainPairs, normalizeChainName as nextNormalizeChainName } from "../src/transfer/chains";
import { quoteFromOrderbook as nextQuoteFromOrderbook } from "../src/market/orderbook";

describe("compatibility modules", () => {
  it("calculations wrapper matches organized module", () => {
    expect(premiumPct(1450, 1, 1400)).toBe(nextPremiumPct(1450, 1, 1400));
    expect(applyFee(100, 0.001, "buy")).toBe(nextApplyFee(100, 0.001, "buy"));
    expect(basisPct(100, 101)).toBe(nextBasisPct(100, 101));
    expect(midPrice(99, 101)).toBe(nextMidPrice(99, 101));
  });

  it("chain wrapper matches organized module", () => {
    const left = ["ERC20", "TRC20", "Arbitrum"];
    const right = ["Ethereum", "TRON", "ARB"];
    expect(normalizeChainName("erc20")).toBe(nextNormalizeChainName("erc20"));
    expect(commonChainPairs(left, right)).toEqual(nextCommonChainPairs(left, right));
  });

  it("orderbook wrapper matches organized module", () => {
    const orderbook = {
      bids: [[10, 1], [9, 1]],
      asks: [[11, 1], [12, 1]],
    };
    expect(quoteFromOrderbook(orderbook, 1.5)).toEqual(nextQuoteFromOrderbook(orderbook, 1.5));
  });

  it("root wrappers preserve helper exports", () => {
    expect(isValidQuote({ bid: 1, ask: 2 })).toBe(true);
    expect(getRoundTripFee("gateio", "spot")).toBeGreaterThan(0);
    expect(isDexExchange("apex")).toBe(true);
    expect(isCcxtDexExchange("apex")).toBe(true);
  });
});
