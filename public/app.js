// DOM Elements
const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

// Header elements
const timeEl = $("time");
const usdtKrwEl = $("usdtKrw");
const pageTitleEl = $("page-title");
const pageSubtitleEl = $("page-subtitle");

// Status elements
const statusDotEl = $("status-dot");
const statusTextEl = $("status-text");

// Badge counts
const b2gCountEl = $("b2g-count");
const g2bCountEl = $("g2b-count");
const cycleCountEl = $("cycle-count");

// Dashboard stats
const bestB2gEl = $("best-b2g");
const bestG2bEl = $("best-g2b");
const bestCycleEl = $("best-cycle");
const totalCoinsEl = $("total-coins");

// Dashboard panels
const dashboardB2gEl = $("dashboard-b2g");
const dashboardG2bEl = $("dashboard-g2b");
const dashboardCyclesEl = $("dashboard-cycles");

// List containers
const listB2gEl = $("list-b2g");
const listG2bEl = $("list-g2b");
const listCyclesEl = $("list-cycles");
const listAllEl = $("list-all");

// Table headers
const thDomesticEl = $("th-domestic");
const thOverseasEl = $("th-overseas");

// Navigation
const navItems = $$(".nav-item[data-tab]");
const tabPanels = $$(".tab-panel");

// Fix button
const cycleFixBtn = $("cycle-fix-btn");

// State
let _currentTab = "dashboard"; // Track current tab state
let cycleSource = null;
let pairSource = null;
let lastCyclePayload = null;
let routeSort = "profit";
let routeFixed = false;
let fixedRouteOrder = [];
let allDomestic = "bithumb";
let allOverseas = "gateio";

const PAGE_INFO = {
  dashboard: { title: "Dashboard", subtitle: "Real-time arbitrage monitoring" },
  b2g: { title: "B2G Routes", subtitle: "Bithumb → Overseas transfer routes" },
  g2b: { title: "G2B Routes", subtitle: "Overseas → Bithumb profit routes" },
  cycles: { title: "Cycle Routes", subtitle: "Complete B→G→B round-trip arbitrage" },
  all: { title: "All Coins", subtitle: "Complete coin list with premium data" },
};

const DOMESTIC_LABELS = { bithumb: "Bithumb", upbit: "Upbit" };
const OVERSEAS_LABELS = { gateio: "GateIO", bybit: "Bybit", okx: "OKX", hyperliquid: "Hyperliquid", lighter: "Lighter" };
const OVERSEAS_SHORT = { gateio: "G", bybit: "Y", okx: "O", hyperliquid: "H", lighter: "L" };
const DOMESTIC_SHORT = { bithumb: "B", upbit: "U" };

// Formatters
const fmtKrw = (v) => (v == null || !Number.isFinite(v) ? "—" : `₩${Math.round(v).toLocaleString()}`);
const fmtPct = (v) => (v == null || !Number.isFinite(v) ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(3)}%`);
const fmtUsdt = (v) => {
  if (v == null || !Number.isFinite(v)) return "—";
  if (v >= 1000) return `${v.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT`;
  if (v >= 1) return `${v.toLocaleString(undefined, { maximumFractionDigits: 6 })} USDT`;
  return `${v.toLocaleString(undefined, { maximumFractionDigits: 10 })} USDT`;
};
const escapeHtml = (v) =>
  v == null
    ? ""
    : String(v)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

// Tab Navigation
function switchTab(tab) {
  _currentTab = tab;
  navItems.forEach((item) => item.classList.toggle("active", item.dataset.tab === tab));
  tabPanels.forEach((panel) => panel.classList.toggle("active", panel.id === `panel-${tab}`));
  const info = PAGE_INFO[tab] || PAGE_INFO.dashboard;
  if (pageTitleEl) pageTitleEl.textContent = info.title;
  if (pageSubtitleEl) pageSubtitleEl.textContent = info.subtitle;
}

navItems.forEach((item) => {
  item.addEventListener("click", () => {
    const tab = item.dataset.tab;
    if (tab) switchTab(tab);
  });
});

// Status management
function setStatus(ok) {
  if (statusDotEl) {
    statusDotEl.classList.toggle("connected", ok);
    statusDotEl.classList.toggle("error", !ok);
  }
  if (statusTextEl) statusTextEl.textContent = ok ? "Connected" : "Disconnected";
}

// Route Card HTML
function routeCardHtml(row, direction, showRank = true) {
  const safeCoin = escapeHtml(row.coin);
  const hasNetEdge = row.netEdgeKrw != null && row.netEdgePct != null;
  const edgeKrw = hasNetEdge ? row.netEdgeKrw : row.edgeKrw;
  const edgePct = hasNetEdge ? row.netEdgePct : row.edgePct;
  const edgeClass = edgeKrw >= 0 ? "positive" : "negative";
  const premiumValue = row.cycle ? (edgePct ?? row.premiumPct) : row.premiumPct;
  const premiumClass = premiumValue >= 0 ? "positive" : "negative";

  const domesticExchange = row.domesticExchange || "bithumb";
  const overseasExchange = row.overseasExchange || "gateio";
  const domShort = DOMESTIC_SHORT[domesticExchange] || "B";
  const ovShort = OVERSEAS_SHORT[overseasExchange] || "G";

  let dirLabel, dirClass;
  if (row.cycle) {
    dirLabel = `${domShort}→${ovShort}→${domShort}`;
    dirClass = "cycle";
  } else if (direction === "g2b") {
    dirLabel = `${ovShort}→${domShort}`;
    dirClass = "g2b";
  } else {
    dirLabel = `${domShort}→${ovShort}`;
    dirClass = "b2g";
  }

  const rankHtml = showRank && row.rank ? `<span class="route-rank">#${row.rank}</span>` : "";

  let metricsHtml = "";
  if (row.cycle) {
    const outCoin = row.outCoin ?? row.coin;
    const backCoin = row.backCoin ?? row.coin;
    const legOut = `${escapeHtml(outCoin)}: ${fmtKrw(row.outDomesticAsk ?? row.domesticAsk)} → ${fmtUsdt(row.outOverseasBid ?? row.gateioSpotBid)}`;
    const legBack = `${escapeHtml(backCoin)}: ${fmtUsdt(row.backOverseasAsk ?? row.gateioSpotAsk)} → ${fmtKrw(row.backDomesticBid ?? row.domesticBid)}`;
    metricsHtml = `
      <div class="route-metric"><span class="label">Net Edge</span><span class="value ${edgeClass}">${fmtKrw(edgeKrw)} (${fmtPct(edgePct)})</span></div>
      <div class="route-metric"><span class="label">Leg A (KRW→USDT)</span><span class="value">${legOut}</span></div>
      <div class="route-metric"><span class="label">Leg B (USDT→KRW)</span><span class="value">${legBack}</span></div>
    `;
  } else {
    const domesticLabel = direction === "g2b" ? `${DOMESTIC_LABELS[domesticExchange]} Bid` : `${DOMESTIC_LABELS[domesticExchange]} Ask`;
    const overseasLabel = direction === "g2b" ? `${OVERSEAS_LABELS[overseasExchange]} Ask` : `${OVERSEAS_LABELS[overseasExchange]} Bid`;
    metricsHtml = `
      <div class="route-metric"><span class="label">Edge</span><span class="value ${edgeClass}">${fmtKrw(edgeKrw)} (${fmtPct(edgePct)})</span></div>
      <div class="route-metric"><span class="label">${domesticLabel}</span><span class="value">${fmtKrw(row.domesticAsk ?? row.domesticBid)}</span></div>
      <div class="route-metric"><span class="label">${overseasLabel}</span><span class="value">${fmtUsdt(row.overseasBid ?? row.gateioSpotAsk)}</span></div>
    `;
  }

  // Transfer info
  let transferHtml = "";
  if (row.transfer?.chains?.length || row.transferOut?.chains?.length || row.transferBack?.chains?.length) {
    const chains = row.transfer?.chains || row.transferOut?.chains || row.transferBack?.chains || [];
    transferHtml = `
      <div class="route-info">
        <div class="route-info-row">
          ${chains
            .slice(0, 2)
            .map((c) => `<span class="info-tag">${escapeHtml(c.senderChain)} · fee ${fmtUsdt(c.feeCoin)}</span>`)
            .join("")}
        </div>
      </div>
    `;
  }

  // Check if transfer is closed (no valid transfer path)
  const transferClosed = row.transferOk === false;
  const cardClass = transferClosed ? "route-card transfer-closed" : "route-card";

  // Show closed reason
  let closedLegHtml = "";
  if (transferClosed) {
    const reasons = [];
    if (row.cycle) {
      // Cycle route: show both legs
      if (row.outTransferOk === false && row.outTransferClosedReason) {
        reasons.push(`[Out] ${escapeHtml(row.outTransferClosedReason)}`);
      } else if (row.outTransferOk === false) {
        reasons.push(`[Out] ${escapeHtml(row.outCoin || row.coin)} 송금 불가`);
      }
      if (row.backTransferOk === false && row.backTransferClosedReason) {
        reasons.push(`[Back] ${escapeHtml(row.backTransferClosedReason)}`);
      } else if (row.backTransferOk === false) {
        reasons.push(`[Back] ${escapeHtml(row.backCoin || row.coin)} 송금 불가`);
      }
    } else {
      // B2G/G2B route: single path
      if (row.outTransferClosedReason) {
        reasons.push(escapeHtml(row.outTransferClosedReason));
      } else {
        reasons.push(`${escapeHtml(row.coin)} 송금 불가`);
      }
    }
    if (reasons.length) {
      closedLegHtml = `<div class="route-info"><span class="info-tag" style="color: var(--accent-red);">${reasons.join(" / ")}</span></div>`;
    }
  }

  return `
    <div class="${cardClass}">
      <div class="route-card-header">
        ${rankHtml}
        <span class="route-coin">${safeCoin}</span>
        <span class="route-direction ${dirClass}">${dirLabel}</span>
        <span class="route-premium ${premiumClass}">${fmtPct(premiumValue)}</span>
      </div>
      <div class="route-metrics">${metricsHtml}</div>
      ${transferHtml}
      ${closedLegHtml}
    </div>
  `;
}

// Table Row HTML
function tableRowHtml(row) {
  const safeCoin = escapeHtml(row.coin);
  const premiumClass = row.premiumPct >= 0 ? "positive" : "negative";
  const edgeClass = row.edgeKrw >= 0 ? "positive" : "negative";

  if (row.missing) {
    return `
      <tr>
        <td class="muted">#${row.rank}</td>
        <td class="coin">${safeCoin}</td>
        <td class="muted">N/A</td>
        <td class="muted">—</td>
        <td class="muted">—</td>
        <td class="muted">—</td>
      </tr>
    `;
  }

  return `
    <tr>
      <td class="muted">#${row.rank}</td>
      <td class="coin">${safeCoin}</td>
      <td class="${premiumClass}">${fmtPct(row.premiumPct)}</td>
      <td class="${edgeClass}">${fmtKrw(row.edgeKrw)} (${fmtPct(row.edgePct)})</td>
      <td>${row.domesticAsk ? fmtKrw(row.domesticAsk) : "—"}</td>
      <td>${row.overseasBid ? fmtUsdt(row.overseasBid) : "—"}</td>
    </tr>
  `;
}

// Sorting
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
    const byKey = new Map(sorted.map((r) => [rowKey(r), r]));
    const ordered = [];
    for (const key of fixedRouteOrder) {
      const r = byKey.get(key);
      if (r) {
        ordered.push(r);
        byKey.delete(key);
      }
    }
    const remaining = Array.from(byKey.values());
    remaining.sort((a, b) => {
      const av = a.netEdgePct ?? a.edgePct ?? -Infinity;
      const bv = b.netEdgePct ?? b.edgePct ?? -Infinity;
      return bv - av || (a.coin ?? "").localeCompare(b.coin ?? "");
    });
    return [...ordered, ...remaining];
  }
  if (routeSort === "name") {
    sorted.sort((a, b) => (a.coin ?? "").localeCompare(b.coin ?? ""));
    return sorted;
  }
  sorted.sort((a, b) => {
    const av = a.netEdgePct ?? a.edgePct ?? -Infinity;
    const bv = b.netEdgePct ?? b.edgePct ?? -Infinity;
    return bv - av || (a.coin ?? "").localeCompare(b.coin ?? "");
  });
  return sorted;
}

// Render functions
function renderDashboard(payload) {
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const watchCoins = Array.isArray(payload.watchCoins) ? payload.watchCoins : [];

  // Separate B2G (near 0%) and G2B (high premium)
  const b2gRows = rows.filter((r) => r.direction === "b2g" || (!r.cycle && Math.abs(r.premiumPct ?? 0) < 1)).sort((a, b) => Math.abs(a.premiumPct ?? 0) - Math.abs(b.premiumPct ?? 0));
  const g2bRows = rows.filter((r) => r.direction === "g2b" || (!r.cycle && (r.premiumPct ?? 0) >= 0.3)).sort((a, b) => (b.premiumPct ?? 0) - (a.premiumPct ?? 0));
  const cycleRows = rows.filter((r) => r.cycle === true);

  // Update badge counts
  if (b2gCountEl) b2gCountEl.textContent = b2gRows.length;
  if (g2bCountEl) g2bCountEl.textContent = g2bRows.length;
  if (cycleCountEl) cycleCountEl.textContent = cycleRows.length;

  // Dashboard stats
  const bestB2g = b2gRows[0];
  const bestG2b = g2bRows[0];
  const bestCycle = [...cycleRows].sort((a, b) => (b.netEdgePct ?? b.edgePct ?? -Infinity) - (a.netEdgePct ?? a.edgePct ?? -Infinity))[0];

  if (bestB2gEl) bestB2gEl.textContent = bestB2g ? `${bestB2g.coin} ${fmtPct(bestB2g.premiumPct)}` : "--";
  if (bestG2bEl) bestG2bEl.textContent = bestG2b ? `${bestG2b.coin} ${fmtPct(bestG2b.premiumPct)}` : "--";
  if (bestCycleEl) bestCycleEl.textContent = bestCycle ? `${bestCycle.coin} ${fmtPct(bestCycle.netEdgePct ?? bestCycle.edgePct)}` : "--";
  if (totalCoinsEl) totalCoinsEl.textContent = watchCoins.length || rows.length;

  // Dashboard panels (top 5 each)
  if (dashboardB2gEl) {
    dashboardB2gEl.innerHTML =
      b2gRows
        .slice(0, 5)
        .map((r, i) => routeCardHtml({ ...r, rank: i + 1 }, "b2g"))
        .join("") || '<div class="empty-state">No B2G routes available</div>';
  }
  if (dashboardG2bEl) {
    dashboardG2bEl.innerHTML =
      g2bRows
        .slice(0, 5)
        .map((r, i) => routeCardHtml({ ...r, rank: i + 1 }, "g2b"))
        .join("") || '<div class="empty-state">No G2B routes available</div>';
  }
  if (dashboardCyclesEl) {
    const sortedCycles = sortCycleRows(cycleRows);
    dashboardCyclesEl.innerHTML =
      sortedCycles
        .slice(0, 5)
        .map((r, i) => routeCardHtml({ ...r, rank: i + 1 }, "cycle"))
        .join("") || '<div class="empty-state">No cycle routes available</div>';
  }
}

function renderB2gRoutes(payload) {
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const b2gRows = rows
    .filter((r) => r.direction === "b2g")
    .sort((a, b) => Math.abs(a.premiumPct ?? 0) - Math.abs(b.premiumPct ?? 0))
    .map((r, i) => ({ ...r, rank: i + 1 }));

  if (listB2gEl) {
    listB2gEl.innerHTML = b2gRows.map((r) => routeCardHtml(r, "b2g")).join("") || '<div class="empty-state">No B2G routes available</div>';
  }
}

function renderG2bRoutes(payload) {
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const g2bRows = rows
    .filter((r) => r.direction === "g2b")
    .sort((a, b) => (b.premiumPct ?? 0) - (a.premiumPct ?? 0))
    .map((r, i) => ({ ...r, rank: i + 1 }));

  if (listG2bEl) {
    listG2bEl.innerHTML = g2bRows.map((r) => routeCardHtml(r, "g2b")).join("") || '<div class="empty-state">No G2B routes available</div>';
  }
}

function renderCycleRoutes(payload) {
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const cycleRows = rows.filter((r) => r.cycle === true);
  const sorted = sortCycleRows(cycleRows);

  if (routeFixed && !fixedRouteOrder.length) {
    fixedRouteOrder = sorted.map((r) => rowKey(r));
  }

  const ranked = sorted.map((r, i) => ({ ...r, rank: i + 1 }));

  if (listCyclesEl) {
    listCyclesEl.innerHTML = ranked.map((r) => routeCardHtml(r, "cycle")).join("") || '<div class="empty-state">No cycle routes available</div>';
  }
}

function renderAllCoins(payload) {
  const allRows = Array.isArray(payload.allRows) ? payload.allRows : Array.isArray(payload.rows) ? payload.rows : [];

  if (listAllEl) {
    listAllEl.innerHTML = allRows.map(tableRowHtml).join("") || '<tr><td colspan="6" class="muted">No data</td></tr>';
  }

  // Update table headers
  if (thDomesticEl) thDomesticEl.textContent = `${DOMESTIC_LABELS[allDomestic] || "Domestic"} Ask`;
  if (thOverseasEl) thOverseasEl.textContent = `${OVERSEAS_LABELS[allOverseas] || "Overseas"} Bid`;
}

// Main render
function renderCycle(payload) {
  lastCyclePayload = payload;

  // Header stats
  if (timeEl) timeEl.textContent = payload.time || "--";
  if (usdtKrwEl) usdtKrwEl.textContent = payload.rate?.usdtKrw ? Math.round(payload.rate.usdtKrw).toLocaleString() : "--";

  renderDashboard(payload);
  renderB2gRoutes(payload);
  renderG2bRoutes(payload);
  renderCycleRoutes(payload);
}

// SSE Handlers
function attachCycleHandlers(src) {
  src.addEventListener("ready", () => setStatus(true));
  src.addEventListener("tick", (event) => {
    setStatus(true);
    try {
      const payload = JSON.parse(event.data);
      renderCycle(payload);
    } catch (e) {
      console.error("Parse error:", e);
    }
  });
  src.addEventListener("status", (event) => {
    try {
      const status = JSON.parse(event.data);
      if (status.phase === "error") {
        setStatus(false);
      }
    } catch (e) {
      console.error("Status parse error:", e);
    }
  });
  src.addEventListener("error", () => setStatus(false));
}

function attachPairHandlers(src) {
  src.addEventListener("tick", (event) => {
    try {
      const payload = JSON.parse(event.data);
      renderAllCoins(payload);
    } catch (e) {
      console.error("Parse error:", e);
    }
  });
}

function connectCycleStream() {
  if (cycleSource) cycleSource.close();
  cycleSource = new EventSource("/api/watch-all");
  attachCycleHandlers(cycleSource);
}

function connectPairStream(domestic, overseas) {
  allDomestic = domestic || allDomestic;
  allOverseas = overseas || allOverseas;
  if (pairSource) pairSource.close();
  pairSource = new EventSource(`/api/watch?domestic=${allDomestic}&overseas=${allOverseas}`);
  attachPairHandlers(pairSource);
}

// Cycle sort handlers
const cycleSortBtns = $$("#cycle-sort-selector .btn-toggle");
cycleSortBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    routeSort = btn.dataset.sort || "profit";
    cycleSortBtns.forEach((b) => b.classList.toggle("active", b === btn));
    if (lastCyclePayload) renderCycleRoutes(lastCyclePayload);
  });
});

// Fix button
if (cycleFixBtn) {
  cycleFixBtn.addEventListener("click", () => {
    routeFixed = !routeFixed;
    fixedRouteOrder = [];
    cycleFixBtn.classList.toggle("active", routeFixed);
    if (lastCyclePayload) renderCycleRoutes(lastCyclePayload);
  });
}

// All coins exchange selectors
const allDomesticBtns = $$("#all-domestic-selector .btn-toggle");
const allOverseasBtns = $$("#all-overseas-selector .btn-toggle");

allDomesticBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const domestic = btn.dataset.domestic;
    if (domestic && domestic !== allDomestic) {
      allDomestic = domestic;
      allDomesticBtns.forEach((b) => b.classList.toggle("active", b.dataset.domestic === domestic));
      connectPairStream(allDomestic, allOverseas);
    }
  });
});

allOverseasBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const overseas = btn.dataset.overseas;
    if (overseas && overseas !== allOverseas) {
      allOverseas = overseas;
      allOverseasBtns.forEach((b) => b.classList.toggle("active", b.dataset.overseas === overseas));
      connectPairStream(allDomestic, allOverseas);
    }
  });
});

// Initialize
fetch("/api/config")
  .then((res) => res.json())
  .then((cfg) => {
    if (cfg.domesticExchange) allDomestic = cfg.domesticExchange;
    if (cfg.overseasExchange) allOverseas = cfg.overseasExchange;
    connectCycleStream();
    connectPairStream(allDomestic, allOverseas);
  })
  .catch(() => {
    connectCycleStream();
    connectPairStream(allDomestic, allOverseas);
  });

switchTab("dashboard");
