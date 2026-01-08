# Kimchi Arbitrage

Real-time kimchi-premium arbitrage monitor for KRW exchanges vs global perp/spot venues.

## Overview

This project streams live best bid/ask from Korean and overseas exchanges, computes premium gaps, and serves a single shared feed to all users via SSE. The web UI shows negative-gap (KRW -> overseas) and positive-gap (overseas -> KRW) opportunities using fee-adjusted quotes.

## Exchanges

Korean (KRW):
- Bithumb
- Upbit

Overseas:
- GateIO
- OKX
- Hyperliquid
- Bybit (may be region-blocked in some locations)
- Lighter

## How It Works

- Shared server-side WebSocket feeds collect best bid/ask for each exchange pair.
- All clients subscribe to the same SSE stream. No per-user recalculation.
- Premium is computed as: (KRW price - USDT price * USDT/KRW) / (USDT price * USDT/KRW).
- Hyperliquid uses USDC markets; USDC is treated as USDT for premium conversion.
- Lighter uses USDC markets; USDC is treated as USDT for premium conversion.

## Quick Start

Install:

```
npm install
```

Run (dev):

```
npm run web
```

Run (production build):

```
npm run build
npm run start:web
```

Open:

```
http://localhost:5177
```

## Environment

Monitoring uses public APIs and does not require API keys. API keys are only needed if you use the CLI trading flows.

Optional variables (for trading CLI):
- BITHUMB_API_KEY / BITHUMB_API_SECRET
- UPBIT_API_KEY / UPBIT_API_SECRET
- GATEIO_API_KEY / GATEIO_API_SECRET
- OKX_API_KEY / OKX_API_SECRET / OKX_API_PASSPHRASE
- BYBIT_API_KEY / BYBIT_API_SECRET
- HYPERLIQUID_WALLET_ADDRESS / HYPERLIQUID_PRIVATE_KEY

## Tests

```
npm run lint
npm test
npm run build
```

## Notes

- Bybit public API can be blocked by CloudFront in certain regions. If that happens, the server will keep retrying and other exchanges will still operate.
- This project is for monitoring and research only. It is not financial advice.
