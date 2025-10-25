// merge_epg.mjs
// Builds list.json for https://cdn.jsdelivr.net/gh/johngrischam/TestEPG@main/list.json
// Based on your last working version (with @main fix)

import fs from "fs/promises";

const OUTPUT = "list.json";
const PRIMARY_URL = "https://tvit.leicaflorianrobert.dev/epg/list.json";
const BASE = "https://services.sg101.prd.sctv.ch";

// ----------------- helpers -----------------
function norm(s) {
  return String(s || "").toLowerCase().replace(/\s|-/g, "");
}
async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch ${url} failed: ${res.status}`);
  return res.json();
}
function ymdUTC(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}
function addDaysUTC(d, days) {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

// ----------------- channel list -----------------
// (Rai Movie REMOVED as requested)
const CHANNELS = [
  // Working RSI channels
  { site: "tv.blue.ch", lang: "it", xmltv_id: "RSI1.it", site_id: "356", name: "RSI 1" },
  { site: "tv.blue.ch", lang: "it", xmltv_id: "RSI2.it", site_id: "357", name: "RSI 2" },

  // New ones
  { site: "tv.blue.ch", lang: "it", xmltv_id: "LA7d.it",      site_id: "239",  name: "La 7d" },
  { site: "tv.blue.ch", lang: "it", xmltv_id: "",             site_id: "2015", name: "Warner TV Italy" },
  { site: "tv.blue.ch", lang: "it", xmltv_id: "RaiGulp.it",   site_id: "332",  name: "Rai Gulp" },
  { site: "tv.blue.ch", lang: "it", xmltv_id: "SuperTennis.it", site_id: "1386", name: "SuperTennis TV" },
  { site: "tv.blue.ch", lang: "it", xmltv_id: "",             site_id: "2064", name: "Radio Italia TV" },
  { site: "tv.blue.ch", lang: "it", xmltv_id: "SkyTG24.it",   site_id: "393",  name: "Sky TG 24" },
];

// Optional aliases for your front-end labels (normalized keys)
const CUSTOM_ALIASES = {
  // HTML: <strong class="zappr-text">La7 Cinema</strong>
  // Map it to La 7d
  "la7cinema": "La 7d",

  // HTML: Warner TV  -> Warner TV Italy
  "warnertv": "Warner TV Italy",

  // Common straightforward ones (kept for clarity)
  "skytg24": "Sky TG 24",
  "raigulp": "Rai Gulp",
  "supertennistv": "SuperTennis TV",
  "radioitaliatv": "Radio Italia TV",
  "rsi1": "RSI 1",
  "rsi2": "RSI 2",
};

// Build alias arrays per channel
function aliasesForChannelName(name) {
  const n = norm(name);
  const aliases = new Set([n]);

  // Any custom alias that points to this channel gets included
  for (const [aliasNorm, targetName] of Object.entries(CUSTOM_ALIASES)) {
    if (targetName === name) aliases.add(aliasNorm);
  }
  return Array.from(aliases);
}

// ----------------- main -----------------
async function main() {
  const now = new Date();
  const start = `${ymdUTC(now)}0600`;
  const end = `${ymdUTC(addDaysUTC(now, 1))}0600`;

  console.log("Merging EPG…");
  const primary = await fetchJson(PRIMARY_URL).catch(() => []);
  const merged = Array.isArray(primary) ? [...primary] : [];

  for (const ch of CHANNELS) {
    const url = `${BASE}/catalog/tv/channels/list/(ids=${ch.site_id};start=${start};end=${end};level=normal)`;
    console.log(`Fetching ${ch.name}: ${url}`);

    try {
      const data = await fetchJson(url);
      const programs = data?.Data?.[0]?.Programs || [];
      if (!programs.length) {
        console.warn(`⚠️ No programs for ${ch.name}`);
        continue;
      }

      merged.push({
        site: ch.site,
        lang: ch.lang,
        xmltv_id: ch.xmltv_id,
        site_id: ch.site_id,
        name: ch.name,
        aliases: aliasesForChannelName(ch.name),
        programs,
      });

      console.log(`✅ Added ${ch.name} (${programs.length} programs)`);
    } catch (e) {
      console.error(`❌ ${ch.name} failed: ${e.message}`);
    }
  }

  await fs.writeFile(OUTPUT, JSON.stringify(merged, null, 2), "utf8");
  console.log(`✅ Done. ${merged.length} channels written to ${OUTPUT}`);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});



