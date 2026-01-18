// DEX Contango Dashboard JavaScript - Centralized Stream Version

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
const contangoCountEl = $("contango-count");
const fundingCountEl = $("funding-count");

// Dashboard panels
const dashboardContangoEl = $("dashboard-contango");

// List containers
const listContangoEl = $("list-contango");
const listFundingEl = $("list-funding");
const listAllEl = $("list-all");

// Navigation
const navItems = $$(".nav-item[data-tab]");
const tabPanels = $$(".tab-panel");

// State
let currentTab = "dashboard";
let contangoDomestic = "bithumb";
let contangoDex = "hyperliquid";
let allDomestic = "bithumb";
let allDex = "hyperliquid";

// Data stores - received from server
let domesticPrices = {}; // { coin: { ask, bid } }
let dexPrices = {}; // { dex: { coin: { bid, ask, lastPrice, fundingRate } } }
let usdtKrwRate = 1400;
let lastUpdateTime = "--";

const PAGE_INFO = {
  dashboard: { title: "DEX Contango", subtitle: "Perp vs Spot arbitrage on DEX" },
  contango: { title: "Contango Opportunities", subtitle: "DEX Perp > Domestic Spot = Profit" },
  funding: { title: "Funding Rate Arbitrage", subtitle: "Earn funding payments" },
  all: { title: "All DEX Coins", subtitle: "Complete list of DEX perp coins" },
};

const DOMESTIC_LABELS = { bithumb: "Bithumb", upbit: "Upbit" };
const DEX_LABELS = {
  hyperliquid: "Hyperliquid",
  dydx: "dYdX",
  paradex: "Paradex",
  lighter: "Lighter",
  backpack: "Backpack",
  apex: "Apex",
  defx: "Defx",
  woofipro: "WOOFi Pro",
  modetrade: "ModeTrade",
  hibachi: "Hibachi",
  delta: "Delta",
  vertex: "Vertex",
  drift: "Drift",
  jupiter: "Jupiter",
  edgex: "EdgeX",
  grvt: "GRVT",
  reya: "Reya",
  nado: "Nado",
  ostium: "Ostium",
  extended: "Extended",
  pacifica: "Pacifica",
  varational: "Varational",
};
const DEX_SHORT = {
  hyperliquid: "HL",
  dydx: "dYdX",
  paradex: "PDX",
  lighter: "LIT",
  backpack: "BP",
  apex: "APX",
  defx: "DFX",
  woofipro: "WOO",
  modetrade: "MODE",
  hibachi: "HIB",
  delta: "DLT",
  vertex: "VTX",
  drift: "DFT",
  jupiter: "JUP",
  edgex: "EDX",
  grvt: "GRV",
  reya: "REY",
  nado: "NAD",
  ostium: "OST",
  extended: "EXT",
  pacifica: "PAC",
  varational: "VAR",
};

const DEX_CHAINS = {
  hyperliquid: "Hyperliquid L1",
  dydx: "dYdX Chain",
  paradex: "Starknet",
  lighter: "Arbitrum",
  backpack: "Solana",
  apex: "StarkEx",
  defx: "Arbitrum",
  woofipro: "Arbitrum",
  modetrade: "Mode",
  hibachi: "Polygon",
  delta: "Polygon",
  vertex: "Ink L2",
  drift: "Solana",
  jupiter: "Solana",
  edgex: "StarkEx",
  grvt: "zkSync",
  reya: "Reya Network",
  nado: "Ink L2",
  ostium: "Arbitrum",
  extended: "Solana",
  pacifica: "Base",
  varational: "Unknown",
};

// All DEX exchanges available
const ALL_DEX_EXCHANGES = [
  "hyperliquid",
  "drift",
  "grvt",
  "reya",
  "extended",
  "pacifica",
  "ostium",
  "nado",
];

// Formatters
const fmtKrw = (v) => (v == null || !Number.isFinite(v) ? "—" : `₩${Math.round(v).toLocaleString()}`);
const fmtPct = (v) => (v == null || !Number.isFinite(v) ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(3)}%`);
const fmtUsdt = (v) => {
  if (v == null || !Number.isFinite(v) || v <= 0) return "—";
  if (v >= 1000) return `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (v >= 1) return `$${v.toLocaleString(undefined, { maximumFractionDigits: 4 })}`;
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 8 })}`;
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
  currentTab = tab;
  navItems.forEach((item) => item.classList.toggle("active", item.dataset.tab === tab));
  tabPanels.forEach((panel) => panel.classList.toggle("active", panel.id === `panel-${tab}`));
  const info = PAGE_INFO[tab] || PAGE_INFO.dashboard;
  if (pageTitleEl) pageTitleEl.textContent = info.title;
  if (pageSubtitleEl) pageSubtitleEl.textContent = info.subtitle;
  renderAll();
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

// Calculate contango
function calculateContango(domesticAskKrw, dexBidUsdt, rate) {
  if (!domesticAskKrw || !dexBidUsdt || !rate || rate <= 0) return null;
  const domesticAskUsdt = domesticAskKrw / rate;
  if (domesticAskUsdt <= 0) return null;
  return ((dexBidUsdt - domesticAskUsdt) / domesticAskUsdt) * 100;
}

// Build combined opportunities
function buildOpportunities(domestic, dex) {
  const opportunities = [];
  const dexData = dexPrices[dex] || {};

  for (const [coin, dexInfo] of Object.entries(dexData)) {
    const domesticInfo = domesticPrices[coin];
    const domesticAsk = domesticInfo?.ask;
    const dexBid = dexInfo?.bid || dexInfo?.lastPrice;

    if (!dexBid || dexBid <= 0) continue;
    if (!domesticAsk || domesticAsk <= 0) continue;

    const contangoPct = calculateContango(domesticAsk, dexBid, usdtKrwRate);

    opportunities.push({
      coin,
      domestic,
      dex,
      domesticAsk,
      dexBid,
      dexAsk: dexInfo?.ask,
      contangoPct,
      fundingRate: dexInfo?.fundingRate || 0,
      hasDomestic: !!domesticAsk && domesticAsk > 0,
    });
  }

  return opportunities;
}

// Detailed Contango Card HTML
function contangoCardHtml(opp, rank) {
  const safeCoin = escapeHtml(opp.coin);
  const contangoClass = (opp.contangoPct || 0) >= 0 ? "positive" : "negative";
  const dexLabel = DEX_LABELS[opp.dex] || opp.dex;
  const dexShort = DEX_SHORT[opp.dex] || opp.dex;
  const domesticLabel = DOMESTIC_LABELS[opp.domestic] || opp.domestic;
  const chain = DEX_CHAINS[opp.dex] || "";

  const domesticAskUsdt = opp.domesticAsk && usdtKrwRate ? opp.domesticAsk / usdtKrwRate : null;
  const spreadUsdt = opp.dexBid && domesticAskUsdt ? opp.dexBid - domesticAskUsdt : null;

  return `
    <div class="route-card">
      <div class="route-card-header">
        <span class="route-rank">#${rank}</span>
        <div class="route-coin-info">
          <span class="route-coin">${safeCoin}</span>
          <span class="route-path">${domesticLabel} → ${dexShort}</span>
        </div>
        <span class="dex-badge ${opp.dex}">${dexShort}</span>
        <span class="route-premium ${contangoClass}">${fmtPct(opp.contangoPct)}</span>
      </div>

      <div class="route-details">
        <div class="route-row">
          <div class="route-leg">
            <span class="leg-label">매수 (Long Spot)</span>
            <span class="leg-exchange">${domesticLabel}</span>
            <span class="leg-price">${fmtKrw(opp.domesticAsk)}</span>
            <span class="leg-price-usdt">${fmtUsdt(domesticAskUsdt)}</span>
          </div>
          <div class="route-arrow">→</div>
          <div class="route-leg">
            <span class="leg-label">매도 (Short Perp)</span>
            <span class="leg-exchange">${dexLabel}</span>
            <span class="leg-price">${fmtUsdt(opp.dexBid)}</span>
            <span class="leg-chain">${chain}</span>
          </div>
        </div>
      </div>

      <div class="route-metrics">
        <div class="route-metric">
          <span class="label">Contango</span>
          <span class="value ${contangoClass}">${fmtPct(opp.contangoPct)}</span>
        </div>
        <div class="route-metric">
          <span class="label">Spread</span>
          <span class="value ${contangoClass}">${spreadUsdt ? (spreadUsdt >= 0 ? '+' : '') + fmtUsdt(Math.abs(spreadUsdt)) : '—'}</span>
        </div>
        <div class="route-metric">
          <span class="label">Funding (8h)</span>
          <span class="value ${opp.fundingRate >= 0 ? 'funding-positive' : 'funding-negative'}">${opp.fundingRate ? fmtPct(opp.fundingRate * 100) : '—'}</span>
        </div>
      </div>

      <div class="route-strategy">
        <span class="strategy-tag long-short">Long ${domesticLabel} Spot</span>
        <span class="strategy-tag long-short">Short ${dexLabel} Perp</span>
      </div>
    </div>
  `;
}

// Simple Contango Card for Dashboard
function simpleContangoCardHtml(opp, rank) {
  const safeCoin = escapeHtml(opp.coin);
  const contangoClass = (opp.contangoPct || 0) >= 0 ? "positive" : "negative";
  const dexShort = DEX_SHORT[opp.dex] || opp.dex;
  const domesticLabel = DOMESTIC_LABELS[opp.domestic] || opp.domestic;

  return `
    <div class="route-card compact">
      <div class="route-card-header">
        <span class="route-rank">#${rank}</span>
        <span class="route-coin">${safeCoin}</span>
        <span class="dex-badge ${opp.dex}">${dexShort}</span>
        <span class="route-premium ${contangoClass}">${fmtPct(opp.contangoPct)}</span>
      </div>
      <div class="route-metrics">
        <div class="route-metric">
          <span class="label">${domesticLabel} Ask</span>
          <span class="value">${fmtKrw(opp.domesticAsk)}</span>
        </div>
        <div class="route-metric">
          <span class="label">DEX Bid</span>
          <span class="value">${fmtUsdt(opp.dexBid)}</span>
        </div>
      </div>
      <div class="route-info-row">
        <span class="info-tag">Long ${domesticLabel}</span>
        <span class="info-tag">Short ${dexShort}</span>
      </div>
    </div>
  `;
}

// Table Row HTML for All Coins
function tableRowHtml(opp, idx) {
  const safeCoin = escapeHtml(opp.coin);
  const contangoClass = (opp.contangoPct || 0) >= 0 ? "contango-positive" : "contango-negative";

  return `
    <tr>
      <td class="muted">#${idx + 1}</td>
      <td class="coin">${safeCoin}</td>
      <td class="${contangoClass}">${opp.contangoPct != null ? fmtPct(opp.contangoPct) : 'N/A'}</td>
      <td>${fmtKrw(opp.domesticAsk)}</td>
      <td>${fmtUsdt(opp.dexBid)}</td>
      <td class="muted">${opp.fundingRate ? fmtPct(opp.fundingRate * 100) : '—'}</td>
    </tr>
  `;
}

// Render functions
function renderDashboard() {
  // Update DEX stats
  const statElements = {
    hyperliquid: $("stat-hyperliquid"),
    drift: $("stat-drift"),
    grvt: $("stat-grvt"),
    reya: $("stat-reya"),
    extended: $("stat-extended"),
    pacifica: $("stat-pacifica"),
    ostium: $("stat-ostium"),
    nado: $("stat-nado"),
  };

  for (const [dex, el] of Object.entries(statElements)) {
    if (!el) continue;
    const data = dexPrices[dex];
    if (data) {
      const count = Object.keys(data).length;
      el.textContent = `${count} coins`;
    } else {
      el.textContent = "--";
    }
  }

  // Aggregate all DEX contango opportunities
  const allContango = [];
  for (const dex of ALL_DEX_EXCHANGES) {
    const opps = buildOpportunities(contangoDomestic, dex);
    for (const opp of opps) {
      if (opp.hasDomestic && opp.contangoPct != null && opp.contangoPct > 0.1) {
        allContango.push(opp);
      }
    }
  }
  allContango.sort((a, b) => (b.contangoPct || 0) - (a.contangoPct || 0));

  // Update contango count badge
  if (contangoCountEl) contangoCountEl.textContent = allContango.length;

  // Render top contango in dashboard
  if (dashboardContangoEl) {
    const top5 = allContango.slice(0, 5);
    dashboardContangoEl.innerHTML =
      top5.map((opp, i) => simpleContangoCardHtml(opp, i + 1)).join("") ||
      '<div class="empty-state">No contango opportunities found</div>';
  }
}

function renderContangoList() {
  const opps = buildOpportunities(contangoDomestic, contangoDex)
    .filter((opp) => opp.hasDomestic && opp.contangoPct != null && opp.contangoPct > 0)
    .sort((a, b) => (b.contangoPct || 0) - (a.contangoPct || 0));

  if (listContangoEl) {
    listContangoEl.innerHTML =
      opps.map((opp, i) => contangoCardHtml(opp, i + 1)).join("") ||
      '<div class="empty-state">No contango opportunities found</div>';
  }
}

function renderAllCoins() {
  const opps = buildOpportunities(allDomestic, allDex).sort(
    (a, b) => (b.contangoPct || -999) - (a.contangoPct || -999)
  );

  if (listAllEl) {
    listAllEl.innerHTML =
      opps.map((opp, i) => tableRowHtml(opp, i)).join("") ||
      '<tr><td colspan="6" class="muted">No data</td></tr>';
  }
}

function renderFunding() {
  if (listFundingEl) {
    listFundingEl.innerHTML = '<div class="empty-state">Funding rate data coming soon</div>';
  }
}

function renderAll() {
  // Update header
  if (timeEl) timeEl.textContent = lastUpdateTime;
  if (usdtKrwEl) usdtKrwEl.textContent = Math.round(usdtKrwRate).toLocaleString();

  renderDashboard();
  if (currentTab === "contango") renderContangoList();
  if (currentTab === "all") renderAllCoins();
  if (currentTab === "funding") renderFunding();
}

// ========== Centralized SSE Stream ==========
let eventSource = null;

function connectStream() {
  if (eventSource) {
    eventSource.close();
  }

  const src = new EventSource("/api/dex-stream");
  eventSource = src;

  src.addEventListener("ready", () => setStatus(true));

  src.addEventListener("tick", (event) => {
    setStatus(true);
    try {
      const payload = JSON.parse(event.data);

      // Update state from server
      lastUpdateTime = payload.time || "--";
      usdtKrwRate = payload.usdtKrw || 1400;
      domesticPrices = payload.domesticPrices || {};
      dexPrices = payload.dexPrices || {};

      renderAll();
    } catch (e) {
      console.error("Parse error:", e);
    }
  });

  src.addEventListener("error", () => {
    setStatus(false);
    console.error("Stream error, reconnecting in 3s...");
    setTimeout(() => connectStream(), 3000);
  });
}

// Exchange selectors for Contango tab
const contangoDomesticBtns = $$("#contango-domestic-selector .btn-toggle");
const contangoDexBtns = $$("#contango-dex-selector .btn-toggle");

contangoDomesticBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const domestic = btn.dataset.domestic;
    if (domestic) {
      contangoDomestic = domestic;
      contangoDomesticBtns.forEach((b) => b.classList.toggle("active", b.dataset.domestic === domestic));
      renderContangoList();
    }
  });
});

contangoDexBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const dex = btn.dataset.dex;
    if (dex) {
      contangoDex = dex;
      contangoDexBtns.forEach((b) => b.classList.toggle("active", b.dataset.dex === dex));
      renderContangoList();
    }
  });
});

// Exchange selectors for All Coins tab
const allDomesticBtns = $$("#all-domestic-selector .btn-toggle");
const allDexBtns = $$("#all-dex-selector .btn-toggle");

allDomesticBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const domestic = btn.dataset.domestic;
    if (domestic) {
      allDomestic = domestic;
      allDomesticBtns.forEach((b) => b.classList.toggle("active", b.dataset.domestic === domestic));
      renderAllCoins();
    }
  });
});

allDexBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const dex = btn.dataset.dex;
    if (dex) {
      allDex = dex;
      allDexBtns.forEach((b) => b.classList.toggle("active", b.dataset.dex === dex));
      renderAllCoins();
    }
  });
});

// Initialize
connectStream();
switchTab("dashboard");
