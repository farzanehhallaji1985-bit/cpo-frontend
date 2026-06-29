/**
 * app.js — CPO Pricing Strategy Tool · Italy
 * Handles calculator, market table, compliance tab, AI advisor
 */

// ── Constants ────────────────────────────────────────────────────
const LOC_MULT  = { urban:1.0, highway:1.12, destination:0.95, residential:0.88 };
const STRAT_MULT = { competitive:0.92, market:1.0, premium:1.10 };

let priceChart   = null;
let marketChart  = null;
let currentMarketType = "dc";
let lastCalc     = {};

// ── Init ─────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  setupTabs();
  calc();                    // show initial result with static data
  await loadData();          // fetch live data (OCM / backend / static)
  calc();                    // recalculate with live benchmarks
  renderMarketTab("dc");
  renderComplianceTab();
});

// ── Tab navigation ───────────────────────────────────────────────
function setupTabs() {
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(s => s.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
      if (btn.dataset.tab === "market") renderMarketTab(currentMarketType);
      if (btn.dataset.tab === "compliance") renderComplianceTab();
    });
  });
}

// ── Calculator ───────────────────────────────────────────────────
function v(id) { return parseFloat(document.getElementById(id).value); }
function set(id, txt) { const el = document.getElementById(id); if (el) el.textContent = txt; }
function setHTML(id, html) { const el = document.getElementById(id); if (el) el.innerHTML = html; }

function acCost()  { return v("elec") + v("net") + v("capex") + v("ops"); }
function dcCost()  { return v("elec") + v("net") + v("capex") * v("dc-mult") + v("ops") + v("peak"); }
function hpcCost() { return v("elec") + v("net") + v("capex") * v("hpc-mult") + v("ops") + v("peak"); }

function withMargin(cost) {
  const m = v("margin") / 100;
  return cost / (1 - m);
}

function applyStrategy(base) {
  const loc  = LOC_MULT[document.getElementById("location").value]  || 1;
  const strat = STRAT_MULT[document.getElementById("strategy").value] || 1;
  return base * loc * strat;
}

function calc() {
  // Update slider display values
  set("elec-v",     `€${v("elec").toFixed(2)}/kWh`);
  set("net-v",      `€${v("net").toFixed(3)}/kWh`);
  set("capex-v",    `€${v("capex").toFixed(3)}/kWh`);
  set("ops-v",      `€${v("ops").toFixed(3)}/kWh`);
  set("margin-v",   `${v("margin")}%`);
  set("dc-mult-v",  `×${v("dc-mult").toFixed(1)}`);
  set("hpc-mult-v", `×${v("hpc-mult").toFixed(1)}`);
  set("peak-v",     `€${v("peak").toFixed(3)}/kWh`);

  // Prices
  const acBreak  = acCost();
  const dcBreak  = dcCost();
  const hpcBreak = hpcCost();

  const acP  = applyStrategy(withMargin(acBreak));
  const dcP  = applyStrategy(withMargin(dcBreak));
  const hpcP = applyStrategy(withMargin(hpcBreak));

  const acMg  = Math.round((acP  - acBreak)  / acP  * 100);
  const dcMg  = Math.round((dcP  - dcBreak)  / dcP  * 100);
  const hpcMg = Math.round((hpcP - hpcBreak) / hpcP * 100);

  // Update KPI cards
  set("out-ac",  `€${acP.toFixed(2)}/kWh`);
  set("out-dc",  `€${dcP.toFixed(2)}/kWh`);
  set("out-hpc", `€${hpcP.toFixed(2)}/kWh`);
  set("be-ac",   `breakeven €${acBreak.toFixed(2)}/kWh`);
  set("be-dc",   `breakeven €${dcBreak.toFixed(2)}/kWh`);
  set("be-hpc",  `breakeven €${hpcBreak.toFixed(2)}/kWh`);
  set("mg-ac",   `${acMg}% margin`);
  set("mg-dc",   `${dcMg}% margin`);
  set("mg-hpc",  `${hpcMg}% margin`);

  // Badges vs live data
  setHTML("badge-ac",  competitiveBadge(acP,  "ac"));
  setHTML("badge-dc",  competitiveBadge(dcP,  "dc"));
  setHTML("badge-hpc", competitiveBadge(hpcP, "hpc"));

  // Rank list
  setHTML("rank-list", buildRankList(dcP, "dc"));
  set("rank-footer", LIVE_DATA
    ? `Source: ${DATA_SOURCE === "ocm" ? "Open Charge Map" : DATA_SOURCE === "backend" ? "Backend API" : "Curated data"} · ${new Date(DATA_TIMESTAMP).toLocaleDateString("it-IT")}`
    : "Loading live data…");

  // Chart
  updatePriceChart(acP, dcP, hpcP);

  // Store for AI
  lastCalc = {
    acP, dcP, hpcP, acBreak, dcBreak, hpcBreak,
    acMg, dcMg, hpcMg,
    elec: v("elec"), net: v("net"), capex: v("capex"), ops: v("ops"),
    mg: v("margin"), dcMult: v("dc-mult"), hpcMult: v("hpc-mult"), peak: v("peak"),
    location: document.getElementById("location").value,
    strategy: document.getElementById("strategy").value,
    avgDC: avgPrice("dc").toFixed(2),
    avgAC: avgPrice("ac").toFixed(2),
    avgHPC: avgPrice("hpc").toFixed(2),
    dataSource: DATA_SOURCE
  };
}

// Listen to all inputs
document.querySelectorAll("input[type=range], select").forEach(el => {
  el.addEventListener("input", calc);
  el.addEventListener("change", calc);
});

// ── Competitive badge ────────────────────────────────────────────
function competitiveBadge(price, type) {
  const avg = avgPrice(type);
  if (!avg) return `<span class="badge" style="background:rgba(107,127,163,0.12);color:var(--muted)">Loading market…</span>`;
  const diff = (price - avg) / avg * 100;
  if (diff < -8) return `<span class="badge badge-ok">Below avg — competitive</span>`;
  if (diff > 12) return `<span class="badge badge-warn">Above avg — premium</span>`;
  return `<span class="badge badge-ok">At market rate</span>`;
}

// ── Rank list ────────────────────────────────────────────────────
function buildRankList(myPrice, type) {
  const data = LIVE_DATA ? (LIVE_DATA[type] || []) : [];
  const all = [
    ...data.filter(d => d.price).map(d => ({ name: d.name, p: d.price, isYou: false })),
    { name: "You", p: myPrice, isYou: true }
  ].sort((a,b) => a.p - b.p);

  const max = Math.max(...all.map(x => x.p));
  return all.map((item, i) => `
    <div class="rank-row ${item.isYou ? "you-highlight" : ""}">
      <span class="rank-num">${i + 1}</span>
      <span class="rank-name">${item.name}${item.isYou ? " (you)" : ""}</span>
      <div class="rank-bar-wrap">
        <div class="rank-bar" style="width:${Math.round(item.p/max*100)}%;background:${item.isYou ? "var(--accent)" : "#3a4a6a"}"></div>
      </div>
      <span class="rank-price">€${item.p.toFixed(2)}</span>
    </div>`).join("");
}

// ── Price comparison chart ────────────────────────────────────────
function updatePriceChart(acP, dcP, hpcP) {
  const itAvgAC  = avgPrice("ac")  || 0.44;
  const itAvgDC  = avgPrice("dc")  || 0.52;
  const itAvgHPC = avgPrice("hpc") || 0.71;

  const data = {
    labels: ["AC (7–22 kW)", "DC (50–150 kW)", "HPC (150–350 kW)"],
    datasets: [
      { label:"Your price", data:[+acP.toFixed(2), +dcP.toFixed(2), +hpcP.toFixed(2)],
        backgroundColor:"#2a78d6", borderRadius:4, barPercentage:0.45 },
      { label:"Italy avg",  data:[+itAvgAC.toFixed(2), +itAvgDC.toFixed(2), +itAvgHPC.toFixed(2)],
        backgroundColor:"#3a4a6a", borderRadius:4, barPercentage:0.45 }
    ]
  };

  const opts = {
    responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{ display:false } },
    scales:{
      y:{ min:0.1,
        ticks:{ callback: val => `€${val.toFixed(2)}`, color:"#6B7FA3", font:{size:11} },
        grid:{ color:"rgba(30,45,69,0.6)" }
      },
      x:{ ticks:{ color:"#6B7FA3", font:{size:11} }, grid:{ display:false } }
    }
  };

  const ctx = document.getElementById("priceChart");
  if (!ctx) return;
  if (priceChart) { priceChart.data = data; priceChart.update(); return; }
  priceChart = new Chart(ctx, { type:"bar", data, options:opts });
}

// ── Market tab ───────────────────────────────────────────────────
function switchType(type, btn) {
  currentMarketType = type;
  document.querySelectorAll(".type-tab").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  renderMarketTab(type);
}

function renderMarketTab(type) {
  const data = LIVE_DATA ? (LIVE_DATA[type] || []) : STATIC_DATA[type] || [];

  // Table
  const tbody = document.getElementById("market-tbody");
  if (!tbody) return;
  tbody.innerHTML = data
    .sort((a,b) => (b.stations||0) - (a.stations||0))
    .map((cpo, i) => `
      <tr>
        <td class="mono">${i+1}</td>
        <td><strong>${cpo.name}</strong></td>
        <td class="mono">${cpo.id}</td>
        <td class="mono">${(cpo.stations||0).toLocaleString("it-IT")}</td>
        <td class="price-cell" style="color:${cpo.price ? "var(--text)" : "var(--red)"}">
          ${cpo.price ? `€${(+cpo.price).toFixed(2)}/kWh` : "— missing"}
        </td>
        <td class="mono" style="font-size:11px;color:var(--muted)">${cpo.feed}</td>
        <td>
          <span class="badge ${cpo.compliant ? "badge-ok" : "badge-high"}">
            ${cpo.compliant ? "✓ AFIR OK" : "✗ Non-compliant"}
          </span>
        </td>
        <td>
          <span class="${cpo.source === "ocm" ? "source-live" : cpo.source === "backend" ? "source-live" : "source-static"}">
            ${cpo.source === "ocm" ? "OCM live" : cpo.source === "backend" ? "API live" : "curated"}
          </span>
        </td>
        <td style="font-size:11px;color:var(--muted);">
          ${DATA_TIMESTAMP ? new Date(DATA_TIMESTAMP).toLocaleDateString("it-IT") : "—"}
        </td>
      </tr>`).join("");

  // Market chart
  renderMarketChart(data, type);
}

function renderMarketChart(data, type) {
  const sorted = [...data].filter(d => d.price).sort((a,b) => a.price - b.price);
  const labels = sorted.map(d => d.name.replace("(NHOA)","").replace("Supercharger","SC").trim());
  const prices = sorted.map(d => +(+d.price).toFixed(2));
  const colors = sorted.map(d => d.source === "ocm" || d.source === "backend" ? "#2a78d6" : "#3a4a6a");

  const chartData = {
    labels,
    datasets:[{ label:`${type.toUpperCase()} price`, data:prices, backgroundColor:colors, borderRadius:4, barPercentage:0.65 }]
  };

  const opts = {
    indexAxis:"y",
    responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{ display:false } },
    scales:{
      x:{ min:0.2, ticks:{ callback: v=>`€${v.toFixed(2)}`, color:"#6B7FA3", font:{size:11} }, grid:{ color:"rgba(30,45,69,0.6)" } },
      y:{ ticks:{ color:"#6B7FA3", font:{size:11} }, grid:{ display:false } }
    }
  };

  const ctx = document.getElementById("marketChart");
  if (!ctx) return;
  if (marketChart) { marketChart.destroy(); }
  // Resize wrapper for number of bars
  const wrap = ctx.closest("div[style]");
  if (wrap) wrap.style.height = `${Math.max(180, sorted.length * 36 + 40)}px`;
  marketChart = new Chart(ctx, { type:"bar", data:chartData, options:opts });
}

// ── Compliance tab ───────────────────────────────────────────────
function renderComplianceTab() {
  const data = LIVE_DATA ? LIVE_DATA.dc : STATIC_DATA.dc;
  const grid = document.getElementById("compliance-cards");
  if (!grid) return;
  grid.innerHTML = data.map(cpo => `
    <div class="comp-card">
      <div class="comp-name">${cpo.name}</div>
      <div class="comp-id">${cpo.id}</div>
      <div class="comp-status ${cpo.compliant ? "comp-ok" : "comp-fail"}">
        ${cpo.compliant ? "✓ AFIR compliant" : "✗ Non-compliant"}
      </div>
      <div class="comp-detail">
        ${cpo.price ? `Ad-hoc price: <strong>€${(+cpo.price).toFixed(2)}/kWh</strong><br>` : `<span style="color:var(--red)">No ad-hoc price published</span><br>`}
        ${cpo.gaps > 0 ? `${cpo.gaps} station${cpo.gaps>1?"s":""} with missing price data<br>` : "All stations priced<br>"}
        Platform: ${cpo.feed}
      </div>
    </div>`).join("");
}

// ── AI Advisor ───────────────────────────────────────────────────
async function askAI() {
  const btn   = document.getElementById("ai-btn");
  const msgEl = document.getElementById("ai-msg");
  if (!btn || !msgEl) return;

  btn.disabled = true;
  btn.textContent = "Analysing…";
  msgEl.textContent = "Connecting to Claude…";

  const c = lastCalc;
  const prompt = `I am a CPO owner setting up EV charging stations in Italy. Here are my full cost inputs and the tool's recommendations:

COSTS:
- Electricity: €${c.elec}/kWh
- Roaming/platform fee: €${c.net}/kWh  
- Hardware amortisation (AC): €${c.capex}/kWh
- Ops & maintenance: €${c.ops}/kWh
- DC capex multiplier: ×${c.dcMult}
- HPC capex multiplier: ×${c.hpcMult}
- Peak demand surcharge (DC/HPC): €${c.peak}/kWh

STRATEGY:
- Target margin: ${c.mg}%
- Location type: ${c.location}
- Pricing strategy: ${c.strategy}

TOOL RECOMMENDATIONS:
- AC price: €${c.acP.toFixed(2)}/kWh (breakeven €${c.acBreak.toFixed(2)}, margin ${c.acMg}%)
- DC price: €${c.dcP.toFixed(2)}/kWh (breakeven €${c.dcBreak.toFixed(2)}, margin ${c.dcMg}%)
- HPC price: €${c.hpcP.toFixed(2)}/kWh (breakeven €${c.hpcBreak.toFixed(2)}, margin ${c.hpcMg}%)

ITALIAN MARKET CONTEXT (${c.dataSource === "ocm" ? "live Open Charge Map data" : "curated data"}):
- Italy avg DC: €${c.avgDC}/kWh
- Italy avg AC: €${c.avgAC}/kWh
- Italy avg HPC: €${c.avgHPC}/kWh

Please provide:
1. A brief assessment of whether these prices are commercially viable and ARERA/AFIR compliant
2. The single biggest risk with this pricing approach
3. One concrete recommendation to improve margin or competitiveness
4. Whether the AC/DC/HPC price spread looks healthy for Italy

Keep it under 180 words. Be direct and specific.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({
        model:"claude-sonnet-4-6",
        max_tokens:500,
        system:"You are a concise EV charging business strategist specialising in Italian CPO pricing, ARERA regulation, and AFIR compliance. Responses are direct, specific, and actionable. Use Euro symbols. No filler text.",
        messages:[{ role:"user", content:prompt }]
      })
    });
    const data = await res.json();
    msgEl.textContent = data.content?.[0]?.text || "No response received.";
  } catch(e) {
    msgEl.textContent = "Could not reach Claude API. Check your internet connection and try again.";
  }

  btn.disabled = false;
  btn.textContent = "Get AI recommendation ↗";
}
