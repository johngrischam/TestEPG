// merge_epg.mjs
// --- EPG Builder / Merger ---
// Works with GitHub @main branch fix
// Generates list.json for https://cdn.jsdelivr.net/gh/johngrischam/TestEPG@main/list.json

import fs from "fs/promises";

const OUTPUT = "list.json";
const PRIMARY_URL = "https://tvit.leicaflorianrobert.dev/epg/list.json";
const BASE = "https://services.sg101.prd.sctv.ch";

// --- Helpers ---
function norm(s) {
  return String(s || "").toLowerCase().replace(/\s|-/g, "");
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
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

// --- Channels to include ---
const CHANNELS = [
  // RSI working channels
  { site: "tv.blue.ch", lang: "it", xmltv_id: "RSI1.it", site_id: "356", name: "RSI 1" },
  { site: "tv.blue.ch", lang: "it", xmltv_id: "RSI2.it", site_id: "357", name: "RSI 2" },

  // === NEW CHANNELS ===
  { site: "tv.blue.ch", lang: "it", xmltv_id: "LA7d.it", site_id: "239", name: "La 7d" },
  { site: "tv.blue.ch", lang: "it", xmltv_id: "RaiMovie.it", site_id: "334", name: "Rai Movie" },
  { site: "tv.blue.ch", lang: "it", xmltv_id: "", site_id: "2015", name: "Warner TV Italy" },
  { site: "tv.blue.ch", lang: "it", xmltv_id: "RaiGulp.it", site_id: "332", name: "Rai Gulp" },
  { site: "tv.blue.ch", lang: "it", xmltv_id: "SuperTennis.it", site_id: "1386", name: "SuperTennis TV" },
  { site: "tv.blue.ch", lang: "it", xmltv_id: "", site_id: "2064", name: "Radio Italia TV" },
  { site: "tv.blue.ch", lang: "it", xmltv_id: "SkyTG24.it", site_id: "393", name: "Sky TG 24" },
];

// --- Aliases for front-end normalization ---
// These ensure your <strong class="zappr-text"> names map correctly to EPG channels
const ALIASES = {
  "la7cinema": "la7d",
  "warnertv": "warnertvitaly",
  "skytg24": "skytg24",
  "raimovie": "raimovie",
  "raigulp": "raigulp",
  "supertennistv": "supertennistv",
  "radioitaliatv": "radioitaliatv",
  "rsi1": "rsi1",
  "rsi2": "rsi2"
};

// --- Main merge function ---
async function main() {
  const now = new Date();
  const start = `${ymdUTC(now)}0600`;
  const end = `${ymdUTC(addDaysUTC(now, 1))}0600`;

  console.log("Merging EPG data...");
  const primary = await fetchJson(PRIMARY_URL).catch(() => []);
  const merged = Array.isArray(primary) ? [...primary] : [];

  for (const ch of CHANNELS) {
    const id = ch.site_id;
    const url = `${BASE}/catalog/tv/channels/list/(ids=${id};start=${start};end=${end};level=normal)`;
    console.log("Fetching", ch.name, url);

    try {
      const data = await fetchJson(url);
      const programs = data?.Data?.[0]?.Programs || [];
      if (!programs.length) {
        console.warn(`⚠️ No programs found for ${ch.name}`);
        continue;
      }

      // Normalize aliases for EPG front-end match
      const key = norm(ch.name);
      const alias = Object.entries(ALIASES).find(([k, v]) => v === key || k === key);
      const normalizedName = alias ? alias[0] : ch.name;

      merged.push({
        site: ch.site,
        lang: ch.lang,
        xmltv_id: ch.xmltv_id,
        site_id: ch.site_id,
        name: ch.name,
        alias: normalizedName,
        programs,
      });

      console.log(`✅ Added ${ch.name} (${programs.length} programs)`);
    } catch (err) {
      console.error(`❌ Failed ${ch.name}:`, err.message);
    }
  }

  await fs.writeFile(OUTPUT, JSON.stringify(merged, null, 2), "utf8");
  console.log(`✅ Done. ${merged.length} total channels written to ${OUTPUT}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});


