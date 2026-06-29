/**
 * data.js — Live data fetcher for Italian CPO prices
 *
 * Sources tried in order:
 *  1. Your own backend (backend/api.py) if deployed — returns Supabase snapshot
 *  2. Open Charge Map public API — free, no key needed for basic use
 *  3. Curated static fallback — always works, clearly labelled
 */

// ── Config ──────────────────────────────────────────────────────
// If you deploy the Python backend, set this to your Railway/Render URL.
// Leave empty to skip and go straight to Open Charge Map.
const BACKEND_URL = "https://cpo-backend-production.up.railway.app";   // e.g. "https://my-cpo-api.railway.app"

// Open Charge Map — free public API, no key needed for Italy queries
const OCM_URL = "https://api.openchargemap.io/v3/poi/?output=json&countrycode=IT&maxresults=500&compact=true&verbose=false";

// ── Static fallback (always available, labelled "static") ────────
const STATIC_DATA = {
  dc: [
    { name:"Enel X Way",         id:"IT*ENX", stations:14000, price:0.55, feed:"OCPI/2.2.1", compliant:true,  gaps:0,  source:"static" },
    { name:"Be Charge",          id:"IT*BCH", stations:7200,  price:0.49, feed:"OCPI/2.2",   compliant:true,  gaps:1,  source:"static" },
    { name:"Eni Plenitude",      id:"IT*ENE", stations:3200,  price:0.57, feed:"OCPI/2.2",   compliant:true,  gaps:0,  source:"static" },
    { name:"A2A E-Mobility",     id:"IT*A2A", stations:2400,  price:0.52, feed:"OCPI/2.2",   compliant:true,  gaps:2,  source:"static" },
    { name:"Atlante (NHOA)",     id:"IT*ATL", stations:1800,  price:0.59, feed:"OCPI/2.2.1", compliant:true,  gaps:0,  source:"static" },
    { name:"Ewiva (VW Group)",   id:"IT*EWI", stations:1100,  price:0.44, feed:"OCPI/2.2.1", compliant:true,  gaps:0,  source:"static" },
    { name:"API·IP (Q8 EV)",     id:"IT*ARA", stations:980,   price:0.58, feed:"OCPI/2.1.1", compliant:true,  gaps:3,  source:"static" },
    { name:"Tesla Supercharger", id:"IT*TES", stations:420,   price:0.42, feed:"Direct",     compliant:true,  gaps:0,  source:"static" },
    { name:"Duferco Energia",    id:"IT*DUF", stations:900,   price:0.48, feed:"OCPI/2.1.1", compliant:true,  gaps:0,  source:"static" },
    { name:"IP Motion",          id:"IT*IPM", stations:540,   price:0.61, feed:"OCPI/2.1.1", compliant:true,  gaps:1,  source:"static" },
    { name:"FAST-E Italy",       id:"IT*FAS", stations:680,   price:null, feed:"OCPI/2.2.1", compliant:false, gaps:12, source:"static" },
    { name:"Neway Charging",     id:"IT*NEW", stations:310,   price:null, feed:"OCPI/2.1.1", compliant:false, gaps:8,  source:"static" },
  ],
  ac: [
    { name:"Enel X Way",         id:"IT*ENX", stations:14000, price:0.45, feed:"OCPI/2.2.1", compliant:true,  gaps:0,  source:"static" },
    { name:"Be Charge",          id:"IT*BCH", stations:7200,  price:0.40, feed:"OCPI/2.2",   compliant:true,  gaps:0,  source:"static" },
    { name:"Eni Plenitude",      id:"IT*ENE", stations:3200,  price:0.47, feed:"OCPI/2.2",   compliant:true,  gaps:0,  source:"static" },
    { name:"A2A E-Mobility",     id:"IT*A2A", stations:2400,  price:0.43, feed:"OCPI/2.2",   compliant:true,  gaps:1,  source:"static" },
    { name:"Ewiva (VW Group)",   id:"IT*EWI", stations:1100,  price:0.36, feed:"OCPI/2.2.1", compliant:true,  gaps:0,  source:"static" },
    { name:"Duferco Energia",    id:"IT*DUF", stations:900,   price:0.39, feed:"OCPI/2.1.1", compliant:true,  gaps:0,  source:"static" },
    { name:"IP Motion",          id:"IT*IPM", stations:540,   price:0.50, feed:"OCPI/2.1.1", compliant:true,  gaps:0,  source:"static" },
    { name:"FAST-E Italy",       id:"IT*FAS", stations:680,   price:null, feed:"OCPI/2.2.1", compliant:false, gaps:8,  source:"static" },
  ],
  hpc: [
    { name:"Enel X Way",         id:"IT*ENX", stations:3200,  price:0.72, feed:"OCPI/2.2.1", compliant:true,  gaps:0,  source:"static" },
    { name:"Atlante (NHOA)",     id:"IT*ATL", stations:620,   price:0.75, feed:"OCPI/2.2.1", compliant:true,  gaps:0,  source:"static" },
    { name:"Ewiva (VW Group)",   id:"IT*EWI", stations:410,   price:0.65, feed:"OCPI/2.2.1", compliant:true,  gaps:0,  source:"static" },
    { name:"Tesla Supercharger", id:"IT*TES", stations:420,   price:0.58, feed:"Direct",     compliant:true,  gaps:0,  source:"static" },
    { name:"Ionity Italy",       id:"IT*ION", stations:180,   price:0.89, feed:"OCPI/2.2",   compliant:true,  gaps:0,  source:"static" },
    { name:"Be Charge HPC",      id:"IT*BCH", stations:340,   price:0.69, feed:"OCPI/2.2",   compliant:true,  gaps:1,  source:"static" },
  ]
};

// ── State ────────────────────────────────────────────────────────
let LIVE_DATA = null;
let DATA_TIMESTAMP = null;
let DATA_SOURCE = "loading";

// ── Main loader ──────────────────────────────────────────────────
async function loadData() {
  // 1) Try own backend first
  if (BACKEND_URL) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/prices?country=IT`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const json = await res.json();
        if (json.data && json.data.length) {
          LIVE_DATA = parseBackendData(json.data);
          DATA_TIMESTAMP = json.fetched_at || new Date().toISOString();
          DATA_SOURCE = "backend";
          updateStatusBadge("live · your backend", true);
          return LIVE_DATA;
        }
      }
    } catch (e) { console.warn("Backend unavailable, trying OCM…", e); }
  }

  // 2) Try Open Charge Map for station counts + operator names
  try {
    const res = await fetch(OCM_URL, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const json = await res.json();
      const enriched = enrichWithOCM(json);
      if (enriched) {
        LIVE_DATA = enriched;
        DATA_TIMESTAMP = new Date().toISOString();
        DATA_SOURCE = "ocm";
        updateStatusBadge("live · Open Charge Map", true);
        return LIVE_DATA;
      }
    }
  } catch (e) { console.warn("OCM unavailable, using static data…", e); }

  // 3) Static fallback
  LIVE_DATA = STATIC_DATA;
  DATA_TIMESTAMP = new Date().toISOString();
  DATA_SOURCE = "static";
  updateStatusBadge("curated data · 2026", false);
  return LIVE_DATA;
}

// ── Parse backend response ───────────────────────────────────────
function parseBackendData(rows) {
  const out = { dc:[], ac:[], hpc:[] };
  rows.forEach(r => {
    const entry = {
      name: r.name, id: r.operator_id,
      stations: r.stations, price: r.price_kwh || r.price_sess,
      feed: r.feed, compliant: r.compliant, gaps: r.gaps || 0,
      source: "backend"
    };
    ["dc","ac","hpc"].forEach(t => { if (r.charger_type === t || !r.charger_type) out.dc.push(entry); });
  });
  return out.dc.length ? out : null;
}

// ── Enrich static data with real station counts from OCM ─────────
function enrichWithOCM(ocmData) {
  if (!Array.isArray(ocmData) || !ocmData.length) return null;

  // Count stations by operator name using OCM OperatorInfo
  const opCounts = {};
  ocmData.forEach(poi => {
    const opName = poi.OperatorInfo?.Title;
    if (opName) opCounts[opName] = (opCounts[opName] || 0) + 1;
  });

  // Map OCM operator names to our CPO IDs
  const OCM_NAME_MAP = {
    "Enel X":          "IT*ENX",
    "BeCharge":        "IT*BCH",
    "be charge":       "IT*BCH",
    "A2A Smart City":  "IT*A2A",
    "Atlante":         "IT*ATL",
    "Ewiva":           "IT*EWI",
    "Tesla":           "IT*TES",
    "FAST-E":          "IT*FAS",
  };

  // Enrich static data with live OCM station counts
  const enriched = JSON.parse(JSON.stringify(STATIC_DATA));
  Object.entries(opCounts).forEach(([ocmName, count]) => {
    const id = Object.entries(OCM_NAME_MAP).find(([k]) => ocmName.toLowerCase().includes(k.toLowerCase()))?.[1];
    if (!id) return;
    ["dc","ac","hpc"].forEach(type => {
      const entry = enriched[type].find(e => e.id === id);
      if (entry) {
        entry.stations = count;
        entry.source = "ocm";
      }
    });
  });

  return enriched;
}

// ── Status badge ─────────────────────────────────────────────────
function updateStatusBadge(text, isLive) {
  const el = document.getElementById("data-status");
  if (el) el.textContent = `Data: ${text}`;
  const dot = document.querySelector(".pulse-dot");
  if (dot) dot.style.background = isLive ? "var(--green)" : "var(--amber)";
  const tag = document.getElementById("data-source-tag");
  if (tag) tag.textContent = DATA_SOURCE === "ocm" ? "OCM live" : DATA_SOURCE === "backend" ? "backend live" : "curated";

  const ts = document.getElementById("market-timestamp");
  if (ts) {
    const d = new Date(DATA_TIMESTAMP);
    ts.textContent = `Data last refreshed: ${d.toLocaleString("it-IT")} · Source: ${DATA_SOURCE === "ocm" ? "Open Charge Map" : DATA_SOURCE === "backend" ? "Your backend" : "Curated static (connect backend for live prices)"}`;
  }
}

// ── Helper: average price ────────────────────────────────────────
function avgPrice(type) {
  if (!LIVE_DATA) return 0;
  const prices = (LIVE_DATA[type] || []).filter(d => d.price).map(d => d.price);
  return prices.length ? prices.reduce((a,b)=>a+b) / prices.length : 0;
}

// ── Refresh ──────────────────────────────────────────────────────
async function refreshData() {
  updateStatusBadge("refreshing…", true);
  LIVE_DATA = null;
  await loadData();
  if (typeof renderMarketTab === "function") renderMarketTab(currentMarketType || "dc");
  if (typeof renderComplianceTab === "function") renderComplianceTab();
  if (typeof calc === "function") calc();
}
