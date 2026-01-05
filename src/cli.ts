import dotenv from "dotenv";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { runKimchiCycle, runReverseCycle, scanReverseClosestToZero, scanReverseAllOnce, watchReverseTopN } from "./flows";

function promptFloat(raw: string, fallback: number): number {
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : fallback;
}

function promptInt(raw: string, fallback: number): number {
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  const value = Number(trimmed);
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}

async function confirmLiveTrading(rl: readline.Interface): Promise<boolean> {
  console.warn("\n⚠️ 실거래(시장가 주문)를 실행합니다.");
  const answer = (await rl.question("계속하려면 'YES' 를 입력하세요 (그 외는 취소): ")).trim().toUpperCase();
  return answer === "YES";
}

async function confirmTransfer(rl: readline.Interface, coin: string, direction: string): Promise<boolean> {
  if (direction === "bithumb_to_gateio") console.info(`\n[5] 이제 ${coin} 를 Bithumb -> GateIO 로 직접 전송하세요.`);
  else console.info(`\n[10] 이제 ${coin} 를 GateIO -> Bithumb 로 직접 전송하세요.`);
  const answer = (await rl.question("입금 완료 후 'Y' 입력 (그 외는 종료): ")).trim().toUpperCase();
  return answer === "Y";
}

export async function main(): Promise<void> {
  dotenv.config();

  const rl = readline.createInterface({ input, output });
  try {
    console.info("\n" + "=".repeat(60));
    console.info("ARBITRAGE (BITHUMB ↔ GATEIO)");
    console.info("=".repeat(60));
    console.info("1) 역프 사이클: Bithumb 매수 + GateIO 선물 숏 → (전송) → GateIO 현물 매도 + 선물 청산");
    console.info("2) 김프 사이클: GateIO 현물 매수 + GateIO 선물 숏 → (전송) → Bithumb 매도 + 선물 청산");
    console.info("3) (스캔만) 역프: 가격차이 0% 근접 코인 리스트");
    console.info("4) (스캔만) 역프: 전체 코인 가격 한번에 출력");
    console.info("5) (워치) 역프 TOP N 고정 + 10초마다 갱신");
    console.info("0) 종료");

    const choice = (await rl.question("\n선택 (0-5): ")).trim();
    if (choice === "3") {
      const limit = promptInt(await rl.question("출력 개수 [30]: "), 30);
      await scanReverseClosestToZero(Math.max(1, limit));
      return;
    }
    if (choice === "4") {
      const concurrency = promptInt(await rl.question("동시 요청 수 [12]: "), 12);
      const sortRaw = (await rl.question("정렬 (reverse|abs|premium) [reverse]: ")).trim().toLowerCase();
      const sort = sortRaw === "premium" ? "premium" : sortRaw === "abs" ? "abs" : "reverse";
      await scanReverseAllOnce({ concurrency: Math.max(1, concurrency), sort });
      return;
    }
    if (choice === "5") {
      const topN = promptInt(await rl.question("TOP N [10]: "), 10);
      const displayTopK = promptInt(await rl.question("표시 TOP K [5]: "), 5);
      const displayFarK = promptInt(await rl.question("큰차이 TOP K [5]: "), 5);
      const notionalKrw = promptFloat(await rl.question("기준 원화 금액(원) [5000000]: "), 5_000_000);
      const intervalSec = promptInt(await rl.question("갱신 간격(초) [1]: "), 1);
      const concurrency = promptInt(await rl.question("동시 요청 수 [12]: "), 12);
      await watchReverseTopN({
        topN: Math.max(1, topN),
        displayTopK: Math.max(1, displayTopK),
        displayFarK: Math.max(0, displayFarK),
        notionalKrw: Math.max(1, notionalKrw),
        intervalSec: Math.max(1, intervalSec),
        concurrency: Math.max(1, concurrency),
      });
      return;
    }

    if (choice !== "1" && choice !== "2") return;

    const chunkUsdt = promptFloat(await rl.question("청크(USDT) [50]: "), 50.0);
    const thresholdDefault = choice === "1" ? -0.1 : 0.1;
    const thresholdLabel = choice === "1" ? "역프 임계값(%) (예: -0.1)" : "김프 임계값(%) (예: 0.1)";
    let threshold = promptFloat(await rl.question(`${thresholdLabel} [${thresholdDefault}]: `), thresholdDefault);
    if (choice === "1" && threshold > 0) threshold = 0.0;
    if (choice === "2" && threshold < 0) threshold = 0.0;

    const basisInput = promptFloat(await rl.question("GateIO 현물/선물 괴리 허용(%) (최대 0.15) [0.15]: "), 0.15);
    const basisThresholdPct = Math.min(basisInput, 0.15);
    const maxChunks = promptInt(await rl.question("진입 청크 횟수 [1]: "), 1);

    if (choice === "1") {
      const entryTopN = promptInt(await rl.question("진입 후보 TOP N (0=전체) [10]: "), 10);
      await runReverseCycle(
        chunkUsdt,
        threshold,
        basisThresholdPct,
        maxChunks,
        () => confirmLiveTrading(rl),
        (coin, dir) => confirmTransfer(rl, coin, dir),
        undefined,
        { entryTopN },
      );
    } else {
      await runKimchiCycle(
        chunkUsdt,
        threshold,
        basisThresholdPct,
        maxChunks,
        () => confirmLiveTrading(rl),
        (coin, dir) => confirmTransfer(rl, coin, dir),
      );
    }
  } finally {
    rl.close();
  }
}
