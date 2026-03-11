# Restructure Notes

- Local professional name: `krw-arbitrage-console`
- Base repo: `KRW-Crypto-Arbitrage`
- Merged imports:
  - `legacy-imports/bithumb-gate-hedger`

## Intent

- Keep `KRW-Crypto-Arbitrage` as the scanner, dashboard, and live execution base.
- Preserve the narrow Bithumb/GateIO execution flow as a migration reference.

## Completed Integration

- Renamed the repository to `krw-arbitrage-console`.
- Folded duplicate root modules into compatibility layers over `core/`, `rates/`, `market/`, `transfer/`, `utils/`, and `exchanges/`.
- Added a first-class CLI preset for the absorbed `bithumb-gate-hedger` flow.

## Remaining Cleanup
1. Remove archived legacy folders after a separate history-preservation pass.
2. Continue moving callers from compatibility imports to the organized module tree.
