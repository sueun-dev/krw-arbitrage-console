# Restructure Notes

- Local professional name: `krw-arbitrage-console`
- Base repo: `KRW-Crypto-Arbitrage`

## Intent

- Keep `KRW-Crypto-Arbitrage` as the scanner, dashboard, and live execution base.
- Preserve the narrow Bithumb/GateIO execution flow as a migration reference.

## Completed Integration

- Renamed the repository to `krw-arbitrage-console`.
- Folded duplicate root modules into compatibility layers over `core/`, `rates/`, `market/`, `transfer/`, `utils/`, and `exchanges/`.
- Added a first-class CLI preset for the absorbed `bithumb-gate-hedger` flow.
- Removed archived source copies after the merged flow was validated.

## Remaining Cleanup
1. Continue moving callers from compatibility imports to the organized module tree.
