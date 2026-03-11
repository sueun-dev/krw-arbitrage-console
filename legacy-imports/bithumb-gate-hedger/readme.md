# Kimchi Hedge System Status

## Why No Trades Right Now
- **Missing futures listings**: Many coins exist on Bithumb spot but not on Gate futures, so basis (futures-spot gap) cannot be computed and those coins are excluded.
- **Basis filter**: Gate spot vs futures gap must be <= 0.2% (`MAX_BASIS_GAP=0.002`); no coins are passing this at the moment.
- **Relative premium rule**: Coin premium must be at least 0.5% lower than the USDT premium (`MIN_RELATIVE_KIMP=-0.005`). Coins that meet this still fail once combined with the futures/basis requirements.
- **P&L filter**: Expected total profit must be >= 1% (`MIN_TOTAL_PCT=1.0`); nothing meets this under current market data.

## Filters / Logic Summary
- Transfers and chain match: Bithumb withdraw enabled, Gate deposit enabled, and a common chain exists.
- Price comparison: Convert Bithumb KRW best ask to USDT via FX, compare to Gate spot USDT to compute the coin premium.
- Basis: Compare Gate spot vs futures; discard if gap exceeds the threshold.
- Split entry: If all filters pass, enter Gate 1x short + Bithumb spot buy in 50 USDT chunks (`CHUNK_USDT`). Withdraw/deposit, Gate spot sell, and futures close are manual steps.

## Ideas to Improve
- Pre-filter to only futures-listed symbols to avoid infeasible pairs.
- Temporarily relax the basis threshold or add a probabilistic entry that accounts for slippage/fees.
- Adjust the relative-premium rule dynamically based on the current USDT premium level.*** End Patch
