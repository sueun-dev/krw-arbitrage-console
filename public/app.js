const $ = (id) => document.getElementById(id);

const statusEl = $("status");
const timeEl = $("time");
const usdtKrwEl = $("usdtKrw");
const configMetaEl = $("config-meta");
const statusDetailEl = $("status-detail");
const listB2G = $("list-b2g");
const listG2B = $("list-g2b");
const listAll = $("list-all");
const allCountEl = $("all-count");
const domesticPairEl = $("domestic-pair");
const domesticOutEl = $("domestic-out");
const domesticInEl = $("domestic-in");
const domesticAskHeaderEl = $("domestic-ask-header");
const overseasPairEl = $("overseas-pair");
const overseasOutEl = $("overseas-out");
const overseasInEl = $("overseas-in");
const overseasGapHeaderEl = $("overseas-gap-header");
const domesticButtons = document.querySelectorAll("[data-domestic]");
const overseasButtons = document.querySelectorAll("[data-overseas]");

let currentDomestic = "bithumb";
let currentOverseas = "gateio";
let source = null;
let streamDomestic = null;
let streamOverseas = null;

const fmtKrw = (value) => {
  if (value == null || Number.isNaN(value)) return "—";
  return `₩${Math.round(value).toLocaleString()}`;
};

const fmtPct = (value) => {
  if (value == null || Number.isNaN(value)) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(3)}%`;
};

const fmtUsdt = (value) => {
  if (value == null || Number.isNaN(value)) return "—";
  if (value >= 1000) return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT`;
  if (value >= 1) return `${value.toLocaleString(undefined, { maximumFractionDigits: 6 })} USDT`;
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 10 })} USDT`;
};

const fmtCoin = (value, coin) => {
  if (value == null || Number.isNaN(value)) return "—";
  if (value >= 1) return `${value.toLocaleString(undefined, { maximumFractionDigits: 8 })} ${coin}`;
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 12 })} ${coin}`;
};

const domesticName = (domestic) => (domestic === "upbit" ? "Upbit" : "Bithumb");
const overseasName = (overseas) =>
  overseas === "bybit"
    ? "Bybit"
    : overseas === "okx"
      ? "OKX"
      : overseas === "hyperliquid"
        ? "Hyperliquid"
        : "GateIO";
const overseasShort = (overseas) =>
  overseas === "bybit" ? "Y" : overseas === "okx" ? "O" : overseas === "hyperliquid" ? "H" : "G";

function updateDomesticUI(domestic) {
  if (domestic !== "upbit" && domestic !== "bithumb") return;
  currentDomestic = domestic;
  const name = domesticName(domestic);
  if (domesticPairEl) domesticPairEl.textContent = name;
  if (domesticOutEl) domesticOutEl.textContent = name;
  if (domesticInEl) domesticInEl.textContent = name;
  if (domesticAskHeaderEl) domesticAskHeaderEl.textContent = `${name} Ask`;
  domesticButtons.forEach((btn) => {
    const isActive = btn.dataset.domestic === domestic;
    btn.classList.toggle("active", isActive);
  });
}

function updateOverseasUI(overseas) {
  if (overseas !== "gateio" && overseas !== "bybit" && overseas !== "okx" && overseas !== "hyperliquid") return;
  currentOverseas = overseas;
  const name = overseasName(overseas);
  if (overseasPairEl) overseasPairEl.textContent = name;
  if (overseasOutEl) overseasOutEl.textContent = name;
  if (overseasInEl) overseasInEl.textContent = name;
  if (overseasGapHeaderEl) overseasGapHeaderEl.textContent = `${name} Gap Price`;
  overseasButtons.forEach((btn) => {
    const isActive = btn.dataset.overseas === overseas;
    btn.classList.toggle("active", isActive);
  });
}

function setStatus(ok) {
  statusEl.textContent = ok ? "Live" : "Disconnected";
  statusEl.classList.toggle("ok", ok);
  statusEl.classList.toggle("bad", !ok);
}

function setStatusDetail(message) {
  statusDetailEl.textContent = `Status: ${message}`;
}

function transferBadges(row) {
  const info = row.transfer;
  if (!info) return "";
  if (!info.chains || !info.chains.length) return `<span>Transfer: n/a</span>`;
  return info.chains
    .map((chain) => {
      const fee = chain.feeCoin != null ? fmtCoin(chain.feeCoin, row.coin) : "fee?";
      const feeKrw = chain.feeKrw != null ? ` (${fmtKrw(chain.feeKrw)})` : "";
      const min =
        chain.minCoin != null ? `, min ${fmtCoin(chain.minCoin, row.coin)}${chain.minKrw != null ? ` (${fmtKrw(chain.minKrw)})` : ""}` : "";
      return `<span>${chain.senderChain} ↔ ${chain.receiverChain} · ${fee}${feeKrw}${min}</span>`;
    })
    .join("");
}

function rowHtml(row) {
  if (row.missing) {
    return `
      <div class="row-card">
        <div class="row-top">
          <div class="rank">#${row.rank}</div>
          <div class="coin">${row.coin}</div>
          <div class="premium negative">N/A</div>
        </div>
        <div class="row-sub">No price data</div>
      </div>
    `;
  }

  const premiumClass = row.premiumPct >= 0 ? "positive" : "negative";
  const edgeClass = row.edgeKrw >= 0 ? "positive" : "negative";
  const name = domesticName(currentDomestic);
  const overseas = overseasName(currentOverseas);
  const short = name === "Upbit" ? "U" : "B";
  const overseasShortName = overseasShort(currentOverseas);
  const direction =
    row.direction === "g2b"
      ? "g2b"
      : row.direction === "b2g"
        ? "b2g"
        : row.transfer?.direction === "g2b"
          ? "g2b"
          : "b2g";
  const directionLabel = direction === "g2b" ? `${overseasShortName}→${short}` : `${short}→${overseasShortName}`;
  const domesticLabel = direction === "g2b" ? `${name} Bid` : `${name} Ask`;
  const gapSource = row.gapSource === "spot" ? "spot" : "perp";
  const overseasLabel =
    direction === "g2b"
      ? gapSource === "spot"
        ? `${overseas} Spot Ask`
        : `${overseas} Perp Ask`
      : gapSource === "spot"
        ? `${overseas} Spot Bid`
        : `${overseas} Perp Bid`;

  const spotLine =
    direction === "g2b"
      ? row.gateioSpotAsk != null
        ? `Spot ask ${fmtUsdt(row.gateioSpotAsk)}`
        : "Spot ask —"
      : row.gateioSpotBid != null && row.gateioSpotSellUsdt != null
        ? gapSource === "spot"
          ? `Spot sell≈${fmtUsdt(row.gateioSpotSellUsdt)}`
          : `Spot bid ${fmtUsdt(row.gateioSpotBid)} · sell≈${fmtUsdt(row.gateioSpotSellUsdt)}`
        : "Spot bid —";

  const perpVsSpot = row.spotVsPerpPct != null ? `Perp vs Spot ${fmtPct(row.spotVsPerpPct)}` : "Perp vs Spot —";

  const imp =
    row.impact && row.impact.domestic != null && row.impact.gateioPerp != null
      ? `imp d/s/p: ${row.impact.domestic.toFixed(3)} / ${row.impact.gateioSpot != null ? row.impact.gateioSpot.toFixed(3) : "n/a"} / ${row.impact.gateioPerp.toFixed(3)}`
      : "imp d/s/p: —";

  return `
    <div class="row-card">
      <div class="row-top">
        <div class="rank">#${row.rank}</div>
        <div class="coin">${row.coin}</div>
        <div class="pill ${direction}">${directionLabel}</div>
        <div class="premium ${premiumClass}">${fmtPct(row.premiumPct)}</div>
      </div>
      <div class="row-body">
        <div class="metric">
          <span class="label">Edge</span>
          <span class="value ${edgeClass}">${fmtKrw(row.edgeKrw)} (${fmtPct(row.edgePct)})</span>
        </div>
        <div class="metric">
          <span class="label">${domesticLabel}</span>
          <span class="value">${Math.round(row.domesticAsk).toLocaleString()} KRW</span>
        </div>
        <div class="metric">
          <span class="label">${overseasLabel}</span>
          <span class="value">${fmtUsdt(row.overseasBid)}</span>
        </div>
      </div>
      <div class="row-sub">
        <span>${spotLine}</span>
        <span>${perpVsSpot}</span>
        <span>${imp}</span>
      </div>
      <div class="transfer">
        ${transferBadges(row)}
      </div>
    </div>
  `;
}

function allRowHtml(row) {
  const premiumClass = row.premiumPct >= 0 ? "positive" : "negative";
  const edgeClass = row.edgeKrw >= 0 ? "positive" : "negative";
  const ask = row.domesticAsk ? `${Math.round(row.domesticAsk).toLocaleString()} KRW` : "—";
  const overseas = row.overseasBid ? fmtUsdt(row.overseasBid) : "—";

  if (row.missing) {
    return `
      <div class="table-row">
        <div class="cell muted">#${row.rank}</div>
        <div class="cell coin">${row.coin}</div>
        <div class="cell muted">N/A</div>
        <div class="cell muted">—</div>
        <div class="cell muted">—</div>
        <div class="cell muted">—</div>
      </div>
    `;
  }

  return `
    <div class="table-row">
      <div class="cell muted">#${row.rank}</div>
      <div class="cell coin">${row.coin}</div>
      <div class="cell premium ${premiumClass}">${fmtPct(row.premiumPct)}</div>
      <div class="cell ${edgeClass}">${fmtKrw(row.edgeKrw)} (${fmtPct(row.edgePct)})</div>
      <div class="cell">${ask}</div>
      <div class="cell">${overseas}</div>
    </div>
  `;
}

function render(payload) {
  timeEl.textContent = payload.time;
  usdtKrwEl.textContent = Math.round(payload.rate.usdtKrw).toLocaleString();
  updateDomesticUI(payload.config?.domesticExchange ?? "bithumb");
  updateOverseasUI(payload.config?.overseasExchange ?? "gateio");

  const allRows = payload.allRows || payload.rows;
  const name = domesticName(currentDomestic);
  const overseas = overseasName(currentOverseas);
  configMetaEl.textContent = `Config: ${name} vs ${overseas} | universe ${allRows.length}`;
  if (allCountEl) allCountEl.textContent = `${allRows.length} coins`;

  const topK = payload.config?.displayTopK ?? 5;
  const farK = payload.config?.displayFarK ?? 5;
  const resolveDirection = (row) => {
    if (row.direction === "b2g" || row.direction === "g2b") return row.direction;
    if (row.transfer?.direction === "b2g" || row.transfer?.direction === "g2b") return row.transfer.direction;
    return row.rank <= topK ? "b2g" : "g2b";
  };
  const b2g = payload.rows.filter((row) => resolveDirection(row) === "b2g").slice(0, topK);
  const g2b = payload.rows.filter((row) => resolveDirection(row) === "g2b").slice(0, farK);

  listB2G.innerHTML = b2g.map(rowHtml).join("");
  listG2B.innerHTML = g2b.map(rowHtml).join("");
  if (listAll) listAll.innerHTML = allRows.map(allRowHtml).join("");
}

function connectStream(domestic, overseas) {
  const nextDomestic = domestic ?? currentDomestic;
  const nextOverseas = overseas ?? currentOverseas;
  if (nextDomestic !== "upbit" && nextDomestic !== "bithumb") return;
  if (nextOverseas !== "gateio" && nextOverseas !== "bybit" && nextOverseas !== "okx" && nextOverseas !== "hyperliquid") return;
  if (streamDomestic === nextDomestic && streamOverseas === nextOverseas && source) return;
  if (source) source.close();
  streamDomestic = nextDomestic;
  streamOverseas = nextOverseas;
  setStatusDetail("Connecting...");

  source = new EventSource(`/api/watch?domestic=${nextDomestic}&overseas=${nextOverseas}`);
  source.addEventListener("ready", () => setStatus(true));
  source.addEventListener("tick", (event) => {
    setStatus(true);
    const payload = JSON.parse(event.data);
    render(payload);
    setStatusDetail("Live");
  });
  source.addEventListener("status", (event) => {
    const status = JSON.parse(event.data);
    if (status.phase === "error") {
      statusEl.textContent = "Error";
      statusEl.classList.add("bad");
    } else if (status.phase === "init" || status.phase === "transfer") {
      statusEl.textContent = "Initializing…";
      statusEl.classList.remove("bad");
    }
    if (status.phase === "tick") {
      setStatusDetail("Live");
      return;
    }
    const progress = status.done != null && status.total != null ? ` (${status.done}/${status.total})` : "";
    setStatusDetail(`${status.message}${progress}`);
  });
  source.addEventListener("error", () => setStatus(false));
}

const syncConfig = (cfg) => {
  if (!cfg) return;
  updateDomesticUI(cfg.domesticExchange ?? "bithumb");
  updateOverseasUI(cfg.overseasExchange ?? "gateio");
  connectStream(cfg.domesticExchange ?? "bithumb", cfg.overseasExchange ?? "gateio");
};

domesticButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const domestic = btn.dataset.domestic;
    if (!domestic) return;
    if (domestic === currentDomestic) return;
    updateDomesticUI(domestic);
    connectStream(domestic, currentOverseas);
  });
});

overseasButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const overseas = btn.dataset.overseas;
    if (!overseas) return;
    if (overseas === currentOverseas) return;
    updateOverseasUI(overseas);
    connectStream(currentDomestic, overseas);
  });
});

fetch("/api/config")
  .then((res) => res.json())
  .then((cfg) => syncConfig(cfg))
  .catch(() => {
    connectStream(currentDomestic, currentOverseas);
  });

connectStream(currentDomestic, currentOverseas);
