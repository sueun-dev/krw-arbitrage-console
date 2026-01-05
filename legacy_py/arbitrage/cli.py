"""Interactive CLI for arbitrage workflows."""

from __future__ import annotations

import logging

from dotenv import load_dotenv

from .bootstrap import ensure_overseas_exchange_hedge_on_path
from .flows import run_kimchi_cycle, run_reverse_cycle

ensure_overseas_exchange_hedge_on_path()

from overseas_exchange_hedge.common.logging_utils import setup_logging

logger = logging.getLogger(__name__)


def _prompt_float(prompt: str, default: float) -> float:
    raw = input(f"{prompt} [{default}]: ").strip()
    if not raw:
        return default
    return float(raw)


def _prompt_int(prompt: str, default: int) -> int:
    raw = input(f"{prompt} [{default}]: ").strip()
    if not raw:
        return default
    return int(raw)


def _confirm_live_trading() -> bool:
    logger.warning("\n⚠️ 실거래(시장가 주문)를 실행합니다.")
    answer = input("계속하려면 'YES' 를 입력하세요 (그 외는 취소): ").strip().upper()
    return answer == "YES"


def _confirm_transfer(coin: str, direction: str) -> bool:
    if direction == "bithumb_to_gateio":
        prompt = f"\n[5] 이제 {coin} 를 Bithumb -> GateIO 로 직접 전송하세요."
    else:
        prompt = f"\n[10] 이제 {coin} 를 GateIO -> Bithumb 로 직접 전송하세요."
    logger.info(prompt)
    return input("입금 완료 후 'Y' 입력 (그 외는 종료): ").strip().upper() == "Y"


def main() -> None:
    load_dotenv()
    setup_logging()

    logger.info("\n" + "=" * 60)
    logger.info("ARBITRAGE (BITHUMB ↔ GATEIO)")
    logger.info("=" * 60)
    logger.info("1) 역프 사이클: Bithumb 매수 + GateIO 선물 숏 → (전송) → GateIO 현물 매도 + 선물 청산")
    logger.info("2) 김프 사이클: GateIO 현물 매수 + GateIO 선물 숏 → (전송) → Bithumb 매도 + 선물 청산")
    logger.info("0) 종료")

    choice = input("\n선택 (0-2): ").strip()
    if choice == "1":
        chunk_usdt = _prompt_float("청크(USDT)", 50.0)
        reverse_threshold_pct = _prompt_float("역프 임계값(%) (예: -0.1)", -0.1)
        if reverse_threshold_pct > 0:
            logger.warning("역프 임계값은 음수로 고정됩니다: 요청=%.3f%% → 적용=0.000%%", reverse_threshold_pct)
            reverse_threshold_pct = 0.0
        basis_threshold_input_pct = _prompt_float("GateIO 현물/선물 괴리 허용(%) (최대 0.15)", 0.15)
        basis_threshold_pct = min(basis_threshold_input_pct, 0.15)
        if basis_threshold_input_pct > 0.15:
            logger.warning("괴리 허용치 상한 0.15%% 적용: 요청=%.3f%% → 적용=0.150%%", basis_threshold_input_pct)
        max_chunks = _prompt_int("진입 청크 횟수", 1)

        run_reverse_cycle(
            chunk_usdt,
            reverse_threshold_pct,
            basis_threshold_pct,
            max_chunks,
            confirm_live=_confirm_live_trading,
            confirm_transfer=_confirm_transfer,
        )
        return

    if choice == "2":
        chunk_usdt = _prompt_float("청크(USDT)", 50.0)
        kimchi_threshold_pct = _prompt_float("김프 임계값(%) (예: 0.1)", 0.1)
        if kimchi_threshold_pct < 0:
            logger.warning("김프 임계값은 양수로 고정됩니다: 요청=%.3f%% → 적용=0.000%%", kimchi_threshold_pct)
            kimchi_threshold_pct = 0.0
        basis_threshold_input_pct = _prompt_float("GateIO 현물/선물 괴리 허용(%) (최대 0.15)", 0.15)
        basis_threshold_pct = min(basis_threshold_input_pct, 0.15)
        if basis_threshold_input_pct > 0.15:
            logger.warning("괴리 허용치 상한 0.15%% 적용: 요청=%.3f%% → 적용=0.150%%", basis_threshold_input_pct)
        max_chunks = _prompt_int("진입 청크 횟수", 1)

        run_kimchi_cycle(
            chunk_usdt,
            kimchi_threshold_pct,
            basis_threshold_pct,
            max_chunks,
            confirm_live=_confirm_live_trading,
            confirm_transfer=_confirm_transfer,
        )
        return

    return
