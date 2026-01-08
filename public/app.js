const $ = (id) => document.getElementById(id);

const statusEl = $("status");
const timeEl = $("time");
const usdtKrwEl = $("usdtKrw");
const configMetaEl = $("config-meta");
const statusDetailEl = $("status-detail");
const listRoutes = $("list-routes");
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
const activePairEl = $("active-pair");
const domesticButtons = document.querySelectorAll("[data-domestic]");
const overseasButtons = document.querySelectorAll("[data-overseas]");
const routeSortButtons = document.querySelectorAll("[data-route-sort]");
const routeFixButton = document.querySelector("[data-route-fix]");

const DOMESTIC_EXCHANGES = ["bithumb", "upbit"];
const OVERSEAS_EXCHANGES = ["gateio", "bybit", "okx", "hyperliquid", "lighter"];

const DOMESTIC_LABELS = {
  bithumb: "Bithumb",
  upbit: "Upbit",
};

const OVERSEAS_LABELS = {
  gateio: "GateIO",
  bybit: "Bybit",
  okx: "OKX",
  hyperliquid: "Hyperliquid",
  lighter: "Lighter",
};

const OVERSEAS_SHORT = {
  gateio: "G",
  bybit: "Y",
  okx: "O",
  hyperliquid: "H",
  lighter: "L",
};

const DEFAULT_DOMESTIC = DOMESTIC_EXCHANGES[0] ?? "bithumb";
const DEFAULT_OVERSEAS = OVERSEAS_EXCHANGES[0] ?? "gateio";

const isDomesticExchange = (value) => DOMESTIC_EXCHANGES.includes(value);
const isOverseasExchange = (value) => OVERSEAS_EXCHANGES.includes(value);
const normalizeDomestic = (value) => (isDomesticExchange(value) ? value : DEFAULT_DOMESTIC);
const normalizeOverseas = (value) => (isOverseasExchange(value) ? value : DEFAULT_OVERSEAS);

let currentDomestic = DEFAULT_DOMESTIC;
let currentOverseas = DEFAULT_OVERSEAS;
let cycleSource = null;
let pairSource = null;
let pairDomestic = null;
let pairOverseas = null;
let lastCyclePayload = null;
const ROUTE_SORT = {
  PROFIT: "profit",
  NAME: "name",
};
let routeSort = ROUTE_SORT.PROFIT;
let routeFixed = false;
let fixedRouteOrder = [];

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

const escapeHtml = (value) => {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

const fmtCoin = (value, coin) => {
  if (value == null || Number.isNaN(value)) return "—";
  const safeCoin = escapeHtml(coin);
  if (value >= 1) return `${value.toLocaleString(undefined, { maximumFractionDigits: 8 })} ${safeCoin}`;
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 12 })} ${safeCoin}`;
};

const domesticName = (domestic) => DOMESTIC_LABELS[normalizeDomestic(domestic)];
const overseasName = (overseas) => OVERSEAS_LABELS[normalizeOverseas(overseas)];
const overseasShort = (overseas) => OVERSEAS_SHORT[normalizeOverseas(overseas)] ?? "?";

function updateActivePair() {
  if (!activePairEl) return;
  activePairEl.textContent = "Auto: All exchanges";
}

function updateRouteSortUI() {
  routeSortButtons.forEach((btn) => {
    const isActive = btn.dataset.routeSort === routeSort;
    btn.classList.toggle("active", isActive);
  });
}

function updateRouteFixUI() {
  if (!routeFixButton) return;
  routeFixButton.classList.toggle("active", routeFixed);
  routeFixButton.setAttribute("aria-pressed", routeFixed ? "true" : "false");
}

function sortProfitPct(row) {
  const value = row.netEdgePct ?? row.edgePct;
  return Number.isFinite(value) ? value : -Infinity;
}

function rowKey(row) {
  const outCoin = row.outCoin ?? row.coin ?? "";
  const backCoin = row.backCoin ?? row.coin ?? "";
  const domestic = row.domesticExchange ?? "";
  const overseas = row.overseasExchange ?? "";
  return `${domestic}|${overseas}|${outCoin}|${backCoin}`;
}

function sortCycleRows(rows) {
  const sorted = [...rows];
  if (routeFixed && fixedRouteOrder.length) {
    const byKey = new Map(sorted.map((row) => [rowKey(row), row]));
    const ordered = [];
    for (const key of fixedRouteOrder) {
      const row = byKey.get(key);
      if (row) {
        ordered.push(row);
        byKey.delete(key);
      }
    }
    const remaining = Array.from(byKey.values());
    remaining.sort((a, b) => {
      const diff = sortProfitPct(b) - sortProfitPct(a);
      if (diff !== 0) return diff;
      return (a.coin ?? "").localeCompare(b.coin ?? "");
    });
    return [...ordered, ...remaining];
  }
  if (routeSort === ROUTE_SORT.NAME) {
    sorted.sort((a, b) => (a.coin ?? "").localeCompare(b.coin ?? ""));
    return sorted;
  }
  sorted.sort((a, b) => {
    const diff = sortProfitPct(b) - sortProfitPct(a);
    if (diff !== 0) return diff;
    return (a.coin ?? "").localeCompare(b.coin ?? "");
  });
  return sorted;
}

function updateDomesticUI(domestic) {
  const nextDomestic = normalizeDomestic(domestic);
  currentDomestic = nextDomestic;
  const name = domesticName(nextDomestic);
  if (domesticPairEl) domesticPairEl.textContent = name;
  if (domesticOutEl) domesticOutEl.textContent = name;
  if (domesticInEl) domesticInEl.textContent = name;
  if (domesticAskHeaderEl) domesticAskHeaderEl.textContent = `${name} Ask`;
  domesticButtons.forEach((btn) => {
    const isActive = btn.dataset.domestic === nextDomestic;
    btn.classList.toggle("active", isActive);
  });
  updateActivePair();
}

function updateOverseasUI(overseas) {
  const nextOverseas = normalizeOverseas(overseas);
  currentOverseas = nextOverseas;
  const name = overseasName(nextOverseas);
  if (overseasPairEl) overseasPairEl.textContent = name;
  if (overseasOutEl) overseasOutEl.textContent = name;
  if (overseasInEl) overseasInEl.textContent = name;
  if (overseasGapHeaderEl) overseasGapHeaderEl.textContent = `${name} Gap Price`;
  overseasButtons.forEach((btn) => {
    const isActive = btn.dataset.overseas === nextOverseas;
    btn.classList.toggle("active", isActive);
  });
  updateActivePair();
}

function setStatus(ok) {
  statusEl.textContent = ok ? "Live" : "Disconnected";
  statusEl.classList.toggle("ok", ok);
  statusEl.classList.toggle("bad", !ok);
}

function setStatusDetail(message) {
  statusDetailEl.textContent = `Status: ${message}`;
}

function renderTransferBadges(info, coin, label) {
  if (!info) return "";
  if (!info.chains || !info.chains.length) return `<span>${label}: n/a</span>`;
  return info.chains
    .map((chain) => {
      const senderChain = escapeHtml(chain.senderChain);
      const receiverChain = escapeHtml(chain.receiverChain);
      const fee = chain.feeCoin != null ? fmtCoin(chain.feeCoin, coin) : "fee?";
      const feeKrw = chain.feeKrw != null ? ` (${fmtKrw(chain.feeKrw)})` : "";
      const min = chain.minCoin != null ? `, min ${fmtCoin(chain.minCoin, coin)}${chain.minKrw != null ? ` (${fmtKrw(chain.minKrw)})` : ""}` : "";
      return `<span>${label} · ${senderChain} ↔ ${receiverChain} · ${fee}${feeKrw}${min}</span>`;
    })
    .join("");
}

function transferBadges(row) {
  const domestic = domesticName(row.domesticExchange ?? currentDomestic);
  const overseas = overseasName(row.overseasExchange ?? currentOverseas);
  if (row.transferOut || row.transferBack) {
    const outCoin = row.outCoin ?? row.coin;
    const backCoin = row.backCoin ?? row.coin;
    const outLabel = `${domestic} → ${overseas}`;
    const backLabel = `${overseas} → ${domestic}`;
    return `${renderTransferBadges(row.transferOut, outCoin, outLabel)}${renderTransferBadges(row.transferBack, backCoin, backLabel)}`;
  }
  const info = row.transfer;
  if (!info) return "";
  const label = info.direction === "g2b" ? `${overseas} → ${domestic}` : `${domestic} → ${overseas}`;
  return renderTransferBadges(info, row.coin, label);
}

function rowHtml(row, directionOverride) {
  if (row.missing) {
    const safeCoin = escapeHtml(row.coin);
    return `
      <div class="row-card">
        <div class="row-top">
          <div class="rank">#${row.rank}</div>
          <div class="coin">${safeCoin}</div>
          <div class="premium negative">N/A</div>
        </div>
        <div class="row-sub">No price data</div>
      </div>
    `;
  }

  const safeCoin = escapeHtml(row.coin);
  const hasNetEdge = row.netEdgeKrw != null && row.netEdgePct != null;
  const edgeKrw = hasNetEdge ? row.netEdgeKrw : row.edgeKrw;
  const edgePct = hasNetEdge ? row.netEdgePct : row.edgePct;
  const edgeClass = edgeKrw >= 0 ? "positive" : "negative";
  const edgeLabel = hasNetEdge ? "Net Edge" : "Edge";
  const domesticExchange = row.domesticExchange ?? currentDomestic;
  const overseasExchange = row.overseasExchange ?? currentOverseas;
  const name = domesticName(domesticExchange);
  const overseas = overseasName(overseasExchange);
  const short = name === "Upbit" ? "U" : "B";
  const overseasShortName = overseasShort(overseasExchange);
  const isCycle = row.cycle === true;
  const premiumValue = isCycle ? edgePct ?? row.premiumPct : row.premiumPct;
  const premiumClass = premiumValue != null && premiumValue >= 0 ? "positive" : "negative";

  if (isCycle) {
    const outCoin = row.outCoin ?? row.coin;
    const backCoin = row.backCoin ?? row.coin;
    const coinLabel = outCoin === backCoin ? outCoin : `${outCoin}→${backCoin}`;
    const safeCoinLabel = escapeHtml(coinLabel);
    const safeOutCoin = escapeHtml(outCoin);
    const safeBackCoin = escapeHtml(backCoin);
    const directionLabel = `${short}→${overseasShortName}→${short}`;
    const hedgeOutTag = `${overseas} Perp Short (${safeOutCoin})`;
    const hedgeBackTag = `${overseas} Perp Short (${safeBackCoin})`;
    const routeLine = `Route: Buy ${safeOutCoin} on ${name} → Transfer (${hedgeOutTag}) → Sell ${safeOutCoin} on ${overseas} → Buy ${safeBackCoin} on ${overseas} → Transfer (${hedgeBackTag}) → Sell ${safeBackCoin} on ${name}`;
    const legOut = `${safeOutCoin}: ${fmtKrw(row.outDomesticAsk ?? row.domesticAsk)} → ${fmtUsdt(row.outOverseasBid ?? row.gateioSpotBid)}`;
    const legBack = `${safeBackCoin}: ${fmtUsdt(row.backOverseasAsk ?? row.gateioSpotAsk)} → ${fmtKrw(row.backDomesticBid ?? row.domesticBid)}`;
    const outPerp = row.outSpotVsPerpPct;
    const backPerp = row.backSpotVsPerpPct;
    const outBasis = outPerp != null ? fmtPct(outPerp) : "—";
    const backBasis = backPerp != null ? fmtPct(backPerp) : "—";
    const hedgeOutLine = `Hedge A: ${overseas} Perp Short (${safeOutCoin}) · basis ${outBasis}`;
    const hedgeBackLine = `Hedge B: ${overseas} Perp Short (${safeBackCoin}) · basis ${backBasis}`;
    const imp =
      row.impact && row.impact.domestic != null && row.impact.gateioPerp != null
        ? `imp d/s/p: ${row.impact.domestic.toFixed(3)} / ${row.impact.gateioSpot != null ? row.impact.gateioSpot.toFixed(3) : "n/a"} / ${row.impact.gateioPerp.toFixed(3)}`
        : "imp d/s/p: —";

    return `
      <div class="row-card">
        <div class="row-top">
          <div class="rank">#${row.rank}</div>
          <div class="coin">${safeCoinLabel}</div>
          <div class="pill cycle">${directionLabel}</div>
          <div class="premium ${premiumClass}">${fmtPct(premiumValue)}</div>
        </div>
        <div class="row-body">
          <div class="metric">
            <span class="label">${edgeLabel}</span>
            <span class="value ${edgeClass}">${fmtKrw(edgeKrw)} (${fmtPct(edgePct)})</span>
          </div>
          <div class="metric">
            <span class="label">Leg A (KRW → USDT)</span>
            <span class="value">${legOut}</span>
          </div>
          <div class="metric">
            <span class="label">Leg B (USDT → KRW)</span>
            <span class="value">${legBack}</span>
          </div>
        </div>
        <div class="row-sub">
          <span>${routeLine}</span>
          <span>${hedgeOutLine}</span>
          <span>${hedgeBackLine}</span>
          <span>${imp}</span>
          ${hasNetEdge ? `<span>Gross Edge ${fmtKrw(row.edgeKrw)} (${fmtPct(row.edgePct)})</span>` : ""}
        </div>
        <div class="transfer">
          ${transferBadges(row)}
        </div>
      </div>
    `;
  }

  const direction =
    directionOverride ??
    (row.direction === "g2b"
      ? "g2b"
      : row.direction === "b2g"
        ? "b2g"
        : row.transfer?.direction === "g2b"
          ? "g2b"
          : "b2g");
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
  const hedgeLabel = `${overseas} Perp Short`;
  const routeLine =
    direction === "g2b"
      ? `Route: Buy ${overseas} Spot → Hedge ${hedgeLabel} → Transfer → Sell ${name} Spot`
      : `Route: Buy ${name} Spot → Hedge ${hedgeLabel} → Transfer → Sell ${overseas} Spot`;

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
        <div class="coin">${safeCoin}</div>
        <div class="pill ${direction}">${directionLabel}</div>
        <div class="premium ${premiumClass}">${fmtPct(premiumValue)}</div>
      </div>
      <div class="row-body">
        <div class="metric">
          <span class="label">${edgeLabel}</span>
          <span class="value ${edgeClass}">${fmtKrw(edgeKrw)} (${fmtPct(edgePct)})</span>
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
        <span>${routeLine}</span>
        <span>${spotLine}</span>
        <span>${perpVsSpot}</span>
        <span>${imp}</span>
        ${hasNetEdge ? `<span>Gross Edge ${fmtKrw(row.edgeKrw)} (${fmtPct(row.edgePct)})</span>` : ""}
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
  const safeCoin = escapeHtml(row.coin);
  const ask = row.domesticAsk ? `${Math.round(row.domesticAsk).toLocaleString()} KRW` : "—";
  const overseas = row.overseasBid ? fmtUsdt(row.overseasBid) : "—";

  if (row.missing) {
    return `
      <div class="table-row">
        <div class="cell muted">#${row.rank}</div>
        <div class="cell coin">${safeCoin}</div>
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
      <div class="cell coin">${safeCoin}</div>
      <div class="cell premium ${premiumClass}">${fmtPct(row.premiumPct)}</div>
      <div class="cell ${edgeClass}">${fmtKrw(row.edgeKrw)} (${fmtPct(row.edgePct)})</div>
      <div class="cell">${ask}</div>
      <div class="cell">${overseas}</div>
    </div>
  `;
}

function renderCycle(payload) {
  lastCyclePayload = payload;
  timeEl.textContent = payload.time;
  usdtKrwEl.textContent = Math.round(payload.rate.usdtKrw).toLocaleString();
  updateActivePair();
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  configMetaEl.textContent = `Config: Auto (all exchanges) | routes ${rows.length}`;

  const sortedRows = sortCycleRows(rows);
  if (routeFixed && !fixedRouteOrder.length) {
    fixedRouteOrder = sortedRows.map((row) => rowKey(row));
  }
  const rankedRows = sortedRows.map((row, idx) => ({ ...row, rank: idx + 1 }));
  const topK = payload.config?.displayTopK ?? 5;
  const resolveDirection = (row) => {
    if (row.direction === "b2g" || row.direction === "g2b") return row.direction;
    if (row.transfer?.direction === "b2g" || row.transfer?.direction === "g2b") return row.transfer.direction;
    return row.rank <= topK ? "b2g" : "g2b";
  };
  const rowsWithDirection = rankedRows.map((row) => ({ row, direction: resolveDirection(row) }));
  if (listRoutes) listRoutes.innerHTML = rowsWithDirection.map((entry) => rowHtml(entry.row, entry.direction)).join("");
}

function renderAllCoins(payload) {
  updateDomesticUI(payload.config?.domesticExchange ?? DEFAULT_DOMESTIC);
  updateOverseasUI(payload.config?.overseasExchange ?? DEFAULT_OVERSEAS);
  const allRows = Array.isArray(payload.allRows) ? payload.allRows : Array.isArray(payload.rows) ? payload.rows : [];
  if (allCountEl) allCountEl.textContent = `${allRows.length} coins`;
  if (listAll) listAll.innerHTML = allRows.map(allRowHtml).join("");
}

function attachCycleHandlers(src) {
  src.addEventListener("ready", () => setStatus(true));
  src.addEventListener("tick", (event) => {
    setStatus(true);
    const payload = JSON.parse(event.data);
    renderCycle(payload);
    setStatusDetail("Live");
  });
  src.addEventListener("status", (event) => {
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
  src.addEventListener("error", () => setStatus(false));
}

function attachPairHandlers(src) {
  src.addEventListener("tick", (event) => {
    const payload = JSON.parse(event.data);
    renderAllCoins(payload);
  });
}

function connectCycleStream() {
  updateActivePair();
  if (cycleSource) cycleSource.close();
  setStatusDetail("Connecting...");
  cycleSource = new EventSource("/api/watch-all");
  attachCycleHandlers(cycleSource);
}

function connectPairStream(domestic, overseas) {
  const nextDomestic = normalizeDomestic(domestic ?? currentDomestic);
  const nextOverseas = normalizeOverseas(overseas ?? currentOverseas);
  if (!pairSource || nextDomestic !== currentDomestic) updateDomesticUI(nextDomestic);
  if (!pairSource || nextOverseas !== currentOverseas) updateOverseasUI(nextOverseas);
  if (pairDomestic === nextDomestic && pairOverseas === nextOverseas && pairSource) return;
  if (pairSource) pairSource.close();
  pairDomestic = nextDomestic;
  pairOverseas = nextOverseas;
  pairSource = new EventSource(`/api/watch?domestic=${nextDomestic}&overseas=${nextOverseas}`);
  attachPairHandlers(pairSource);
}

const syncConfig = (cfg) => {
  if (!cfg) return;
  updateDomesticUI(cfg.domesticExchange ?? DEFAULT_DOMESTIC);
  updateOverseasUI(cfg.overseasExchange ?? DEFAULT_OVERSEAS);
  connectCycleStream();
  connectPairStream(cfg.domesticExchange ?? DEFAULT_DOMESTIC, cfg.overseasExchange ?? DEFAULT_OVERSEAS);
};

domesticButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const domestic = btn.dataset.domestic;
    if (!domestic) return;
    if (domestic === currentDomestic) return;
    connectPairStream(domestic, currentOverseas);
  });
});

overseasButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const overseas = btn.dataset.overseas;
    if (!overseas) return;
    if (overseas === currentOverseas) return;
    connectPairStream(currentDomestic, overseas);
  });
});

routeSortButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const nextSort = btn.dataset.routeSort;
    if (!nextSort || nextSort === routeSort) return;
    routeSort = nextSort;
    updateRouteSortUI();
    if (lastCyclePayload) renderCycle(lastCyclePayload);
  });
});

if (routeFixButton) {
  routeFixButton.addEventListener("click", () => {
    routeFixed = !routeFixed;
    fixedRouteOrder = [];
    updateRouteFixUI();
    if (lastCyclePayload) renderCycle(lastCyclePayload);
  });
}

fetch("/api/config")
  .then((res) => res.json())
  .then((cfg) => syncConfig(cfg))
  .catch(() => {
    connectCycleStream();
    connectPairStream(currentDomestic, currentOverseas);
  });

connectCycleStream();
connectPairStream(currentDomestic, currentOverseas);
updateRouteSortUI();
updateRouteFixUI();
