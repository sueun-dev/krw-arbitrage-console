# Kimchi Arbitrage

Real-time cryptocurrency arbitrage monitor for KRW exchanges vs global CEX/DEX venues.

## Features

### Kimchi Premium Monitor
- Real-time streaming of best bid/ask from Korean and overseas exchanges
- Computes premium gaps with fee-adjusted quotes
- Single shared SSE feed for all users (no per-user recalculation)
- Supports both negative-gap (KRW → overseas) and positive-gap (overseas → KRW) opportunities

### DEX Contango Dashboard
- Real-time DEX perpetual vs domestic spot arbitrage opportunities
- Centralized server-side data aggregation for efficiency
- Supports multiple DEX platforms with live price streaming
- Contango calculation: (DEX Perp Bid - Domestic Ask USDT) / Domestic Ask USDT × 100%

## Supported Exchanges

### Korean (KRW)
- Bithumb
- Upbit

### Overseas CEX
- GateIO
- OKX
- Bybit (may be region-blocked)
- Lighter

### DEX Perpetuals
- Hyperliquid
- Drift
- GRVT
- Reya
- Extended
- Pacifica
- Ostium
- Nado

## How It Works

### Premium Calculation
- Premium = (KRW price - USDT price × USDT/KRW) / (USDT price × USDT/KRW)
- USDC markets (Hyperliquid, Lighter) are treated as USDT for conversion

### Architecture
- Shared server-side WebSocket feeds collect best bid/ask for each exchange pair
- All clients subscribe to the same SSE stream
- DEX data is aggregated centrally and broadcast to all connected clients

## Quick Start

Install:
```bash
npm install
```

Run (dev):
```bash
npm run web
```

Run (production):
```bash
npm run build
npm run start:web
```

Access:
- Kimchi Premium: http://localhost:5177
- DEX Contango: http://localhost:5177/dex.html

## Environment Variables

Monitoring uses public APIs and does not require API keys. API keys are only needed for CLI trading flows.

Optional variables (for trading CLI):
- `BITHUMB_API_KEY` / `BITHUMB_API_SECRET`
- `UPBIT_API_KEY` / `UPBIT_API_SECRET`
- `GATEIO_API_KEY` / `GATEIO_API_SECRET`
- `OKX_API_KEY` / `OKX_API_SECRET` / `OKX_API_PASSPHRASE`
- `BYBIT_API_KEY` / `BYBIT_API_SECRET`
- `HYPERLIQUID_WALLET_ADDRESS` / `HYPERLIQUID_PRIVATE_KEY`

## Development

```bash
npm run lint
npm test
npm run build
```

## Notes

- Bybit public API can be blocked by CloudFront in certain regions. Other exchanges will still operate.
- This project is for monitoring and research only. Not financial advice.

---

# 김치 프리미엄 아비트라지

한국 거래소와 해외 CEX/DEX 간의 실시간 암호화폐 차익거래 모니터링 도구입니다.

## 기능

### 김치 프리미엄 모니터
- 한국 및 해외 거래소의 실시간 매수/매도 호가 스트리밍
- 수수료 반영 프리미엄 계산
- 모든 사용자에게 단일 SSE 피드 제공 (사용자별 재계산 없음)
- 역프리미엄 (KRW → 해외) 및 정프리미엄 (해외 → KRW) 기회 모니터링

### DEX 콘탱고 대시보드
- DEX 무기한 선물 vs 국내 현물 차익거래 기회 실시간 모니터링
- 효율적인 서버 사이드 데이터 집계
- 다중 DEX 플랫폼 실시간 가격 스트리밍 지원
- 콘탱고 계산: (DEX 선물 매수가 - 국내 현물 매도가 USDT) / 국내 현물 매도가 USDT × 100%

## 지원 거래소

### 국내 (KRW)
- 빗썸
- 업비트

### 해외 CEX
- GateIO
- OKX
- Bybit (일부 지역 차단 가능)
- Lighter

### DEX 무기한 선물
- Hyperliquid
- Drift
- GRVT
- Reya
- Extended
- Pacifica
- Ostium
- Nado

## 작동 방식

### 프리미엄 계산
- 프리미엄 = (KRW 가격 - USDT 가격 × USDT/KRW 환율) / (USDT 가격 × USDT/KRW 환율)
- USDC 마켓 (Hyperliquid, Lighter)은 USDT로 변환하여 계산

### 아키텍처
- 서버 사이드 WebSocket으로 각 거래소 호가 수집
- 모든 클라이언트가 동일한 SSE 스트림 구독
- DEX 데이터는 중앙에서 집계 후 연결된 모든 클라이언트에 브로드캐스트

## 빠른 시작

설치:
```bash
npm install
```

개발 모드 실행:
```bash
npm run web
```

프로덕션 실행:
```bash
npm run build
npm run start:web
```

접속:
- 김치 프리미엄: http://localhost:5177
- DEX 콘탱고: http://localhost:5177/dex.html

## 환경 변수

모니터링은 공개 API를 사용하므로 API 키가 필요하지 않습니다. API 키는 CLI 거래 기능 사용 시에만 필요합니다.

선택 변수 (CLI 거래용):
- `BITHUMB_API_KEY` / `BITHUMB_API_SECRET`
- `UPBIT_API_KEY` / `UPBIT_API_SECRET`
- `GATEIO_API_KEY` / `GATEIO_API_SECRET`
- `OKX_API_KEY` / `OKX_API_SECRET` / `OKX_API_PASSPHRASE`
- `BYBIT_API_KEY` / `BYBIT_API_SECRET`
- `HYPERLIQUID_WALLET_ADDRESS` / `HYPERLIQUID_PRIVATE_KEY`

## 개발

```bash
npm run lint
npm test
npm run build
```

## 참고사항

- Bybit 공개 API는 일부 지역에서 CloudFront에 의해 차단될 수 있습니다. 다른 거래소는 정상 작동합니다.
- 이 프로젝트는 모니터링 및 연구 목적입니다. 투자 조언이 아닙니다.
