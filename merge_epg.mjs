// merge_epg.mjs — FIXED version restoring correct data path
// Keeps @main fix and removes Rai Movie

import fs from "fs/promises";

const OUTPUT = "list.json";
const PRIMARY_URL = "https://tvit.leicaflorianrobert.dev/epg/list.json";
const BASE = "https://services.sg101.prd.sctv.ch";

// --- helpers ---
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

// --- channel list ---
const CHANNELS = [
  { site: "tv.blue.ch", lang: "it", xmltv_id: "RSI1.it", site_id: "356", name: "RSI 1" },
  { site: "tv.blue.ch", lang: "it", xmltv_id: "RSI2.it", site_id: "357", name: "RSI 2" },
  { site: "tv.blue.ch", lang: "it", xmltv_id: "LA7d.it", site_id: "239", name: "La 7d" },
  { site: "tv.blue.ch", lang: "it", xmltv_id: "", site_id: "2015", name: "Warner TV Italy" },
  { site: "tv.blue.ch", lang: "it", xmltv_id: "RaiGulp.it", site_id: "332", name: "Rai Gulp" },
  { site: "tv.blue.ch", lang: "it", xmltv_id: "SuperTennis.it", site_id: "1386", name: "SuperTennis TV" },
  { site: "tv.blue.ch", lang: "it", xmltv_id: "", site_id: "2064", name: "Radio Italia TV" },
  { site: "tv.blue.ch", lang: "it", xmltv_id: "SkyTG24.it", site_id: "393", name: "Sky TG 24" },
];

// optional aliases (for front-end names)
const CUSTOM_ALIASES = {
  "la7cinema": "La 7d",
  "warnertv": "Warner TV Italy",
  "skytg24": "Sky TG 24",
  "raigulp": "Rai Gulp",
  "supertennistv": "SuperTennis TV",
  "radioitaliatv": "Radio Italia TV",
  "rsi1": "RSI 1",
  "rsi2": "RSI 2",
};

function aliasesForChannelName(name) {
  const aliases = [norm(name)];
  for (const [aliasNorm, targetName] of Object.entries(CUSTOM_ALIASES)) {
    if (targetName === name) aliases.push(aliasNorm);
  }
  return [...new Set(aliases)];
}

// --- main ---
async function main() {
  const now = new Date();
  const start = `${ymdUTC(now)}0600`;
  const end = `${ymdUTC(addDaysUTC(now, 1))}0600`;

  console.log("Merging EPG...");
  const primary = await fetchJson(PRIMARY_URL).catch(() => []);
  const merged = Array.isArray(primary) ? [...primary] : [];

  for (const ch of CHANNELS) {
    const url = `${BASE}/catalog/tv/channels/list/(ids=${ch.site_id};start=${start};end=${end};level=normal)`;
    console.log(`Fetching ${ch.name}: ${url}`);

    try {
      const data = await fetchJson(url);

      // ✅ Corrected path: Data[0].Channels[0].Programs
      const programs = data?.Data?.[0]?.Channels?.[0]?.Programs || [];

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



