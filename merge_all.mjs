// merge_all.mjs — unify list.json + filtered_epg.json → merged_test.json
import fs from "fs/promises";

const LIST_URL = "https://raw.githubusercontent.com/johngrischam/TestEPG/refs/heads/main/list.json";
const FILTERED_URL = "https://raw.githubusercontent.com/johngrischam/TestEPG/refs/heads/main/filtered_epg.json";
const OUTPUT_FILE = "merged_test.json";

// Utility: normalized lowercase name (for matching)
const norm = (s) => String(s || "").toLowerCase().replace(/\s|-/g, "");

// Fetch and parse JSON safely
async function fetchJson(url) {
  const r = await fetch(url, { headers: { "User-Agent": "merge_all.mjs/1.0" } });
  if (!r.ok) throw new Error(`Fetch failed: ${url} → ${r.status}`);
  return r.json();
}

// Normalize any channel into a shared format
function normalizeChannel(ch) {
  if (!ch) return null;

  const site_id = ch.site_id || ch.id || null;
  const name = ch.name || ch.epgName || "Unknown";
  const epgName = ch.epgName || name;
  const logo = ch.logo || ch.icon || "";

  // unify program fields
  const programs = Array.isArray(ch.programs)
    ? ch.programs.map(p => ({
        title: p.title || "",
        description: p.description || p.desc || "",
        start: p.start || null,
        end: p.end || p.stop || null,
        poster: p.poster || p.icon || logo || null
      }))
      .filter(p => p.start && p.end)
      .sort((a, b) => new Date(a.start) - new Date(b.start))
    : [];

  return { site_id, name, epgName, logo, programs };
}

async function main() {
  console.log("📡 Fetching list.json and filtered_epg.json ...");

  let listData = [];
  let filteredData = [];

  try {
    listData = await fetchJson(LIST_URL);
  } catch (e) {
    console.warn("⚠️ Failed to fetch list.json:", e.message);
  }

  try {
    filteredData = await fetchJson(FILTERED_URL);
  } catch (e) {
    console.warn("⚠️ Failed to fetch filtered_epg.json:", e.message);
  }

  const combined = [];
  const seen = new Set();

  // Process list.json first (priority)
  for (const ch of listData) {
    const n = normalizeChannel(ch);
    if (!n) continue;
    const key = n.site_id ? String(n.site_id) : norm(n.name);
    if (seen.has(key)) continue;
    seen.add(key);
    combined.push(n);
  }

  // Then add filtered_epg.json (no duplicates)
  for (const ch of filteredData) {
    const n = normalizeChannel(ch);
    if (!n) continue;
    const key = n.site_id ? String(n.site_id) : norm(n.name);
    if (seen.has(key)) continue;
    seen.add(key);
    combined.push(n);
  }

  console.log(`✅ Merged total channels: ${combined.length}`);
  await fs.writeFile(OUTPUT_FILE, JSON.stringify(combined, null, 2), "utf8");
  console.log(`💾 Saved → ${OUTPUT_FILE}`);
}

main().catch(e => {
  console.error("❌ Fatal error:", e);
  process.exit(1);
});
