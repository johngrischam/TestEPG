// merge_all.mjs — Unified backend: SamsungTVPlus + Blue.ch
// ---------------------------------------------------------
// This script:
// 1. Fetches SamsungTVPlus Italy EPG (XML)
// 2. Fetches Blue.ch channel list (XML)
// 3. For each Blue.ch channel, fetches its EPG (JSON)
// 4. Merges both by ID → fallback to name
// 5. Writes unified merged_all.json

import fs from "fs/promises";
import { XMLParser } from "fast-xml-parser";

// ====== CONFIG ======
const OUT_FILE = "merged_all.json";

// 🟦 SamsungTVPlus Italy XML source
const SAMSUNG_URL =
  "https://raw.githubusercontent.com/matthuisman/i.mjh.nz/refs/heads/master/SamsungTVPlus/it.xml";

// 🟩 Blue.ch XML list source (for channel IDs + names)
const BLUE_LIST_XML =
  "https://raw.githubusercontent.com/iptv-org/epg/refs/heads/master/sites/tv.blue.ch/tv.blue.ch.channels.xml";

// 🟧 Blue.ch JSON API base for EPG per channel
const BLUE_BASE = "https://services.sg101.prd.sctv.ch";

// ====== HELPERS ======
function norm(str) {
  return String(str || "").toLowerCase().replace(/\s|-/g, "");
}

async function fetchText(url) {
  const r = await fetch(url, {
    headers: { "User-Agent": "merge_all-script/1.0" },
  });
  if (!r.ok) throw new Error(`Fetch failed ${r.status}: ${url}`);
  return r.text();
}

async function fetchJson(url) {
  const r = await fetch(url, {
    headers: { "User-Agent": "merge_all-script/1.0" },
  });
  if (!r.ok) throw new Error(`Fetch failed ${r.status}: ${url}`);
  return r.json();
}

function ymdUTC(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}
function addDaysUTC(d, days) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days));
}

// ====== SAMSUNG SOURCE ======
async function fetchSamsung() {
  console.log("📡 Fetching SamsungTVPlus Italy XML...");
  const xmlText = await fetchText(SAMSUNG_URL);
  const parser = new XMLParser({ ignoreAttributes: false });
  const xml = parser.parse(xmlText);
  const channels = xml.tv?.channel || [];
  const programs = xml.tv?.programme || [];

  const data = channels.map((ch) => {
    const id = ch["@_id"];
    const name =
      (ch["display-name"]?.["#text"] || ch["display-name"])?.trim?.() || id;
    const logo = ch.icon?.["@_src"] || "";
    const progs = programs
      .filter((p) => p["@_channel"] === id)
      .map((p) => ({
        title: p.title?.["#text"] || p.title || "",
        description: p.desc?.["#text"] || p.desc || "",
        start: p["@_start"],
        end: p["@_stop"],
        poster: p.icon?.["@_src"] || logo || null,
      }))
      .filter((p) => p.start && p.end);

    return { id, name, logo, programs: progs };
  });

  console.log(`✅ Samsung: ${data.length} channels parsed.`);
  return data;
}

// ====== BLUE.CH SOURCE ======
async function fetchBlue() {
  console.log("📡 Fetching Blue.ch channel list (XML)...");
  const xmlText = await fetchText(BLUE_LIST_XML);
  const parser = new XMLParser({ ignoreAttributes: false });
  const xml = parser.parse(xmlText);
  const channels = xml.channels?.channel || [];
  if (!Array.isArray(channels)) throw new Error("Invalid Blue.ch XML structure");

  const today = new Date();
  const startParam = `${ymdUTC(today)}0600`;
  const endParam = `${ymdUTC(addDaysUTC(today, 1))}0600`;

  const results = [];

  for (const ch of channels) {
    const site_id = ch["@_site_id"];
    const name = (ch["#text"] || ch["#cdata"] || "").trim();
    if (!site_id) continue;

    const url = `${BLUE_BASE}/catalog/tv/channels/list/(ids=${site_id};start=${startParam};end=${endParam};level=normal)`;

    try {
      const json = await fetchJson(url);
      const items =
        json?.Nodes?.Items?.[0]?.Content?.Nodes?.Items ||
        json?.Nodes?.Items?.[0]?.Nodes?.Items ||
        [];
      if (!Array.isArray(items) || !items.length) continue;

      const programs = items
        .slice(0, 50)
        .map((b) => {
          const desc = b?.Content?.Description || {};
          const avail = Array.isArray(b?.Availabilities)
            ? b.Availabilities[0]
            : null;
          const start = avail?.AvailabilityStart || null;
          const end = avail?.AvailabilityEnd || null;
          if (!start || !end) return null;
          const title = desc.Title || "";
          const summary = desc.Summary || desc.ShortSummary || "";
          return { title, description: summary, start, end, poster: null };
        })
        .filter(Boolean);

      results.push({
        site_id,
        name,
        logo: "",
        programs,
      });
      console.log(`✅ Blue.ch channel added: ${name} (${site_id})`);
    } catch (err) {
      console.warn(`⚠️ Blue.ch fetch failed for ${name} (${site_id}):`, err.message);
    }
  }

  console.log(`✅ Blue.ch total channels fetched: ${results.length}`);
  return results;
}

// ====== MERGE ======
function mergeAll(samsung, blue) {
  console.log("🔄 Merging SamsungTVPlus + Blue.ch ...");
  const out = [...samsung];

  for (const ch of blue) {
    const id = ch.site_id || "";
    const name = ch.name || "";
    let found = -1;

    // Try match by site_id or id
    if (id) {
      found = out.findIndex(
        (x) =>
          String(x.site_id || x.id || "") === String(id) ||
          String(x.id || x.site_id || "") === String(id)
      );
    }

    // Fallback: match by normalized name
    if (found < 0 && name) {
      found = out.findIndex((x) => norm(x.name) === norm(name));
    }

    if (found >= 0) {
      // Merge programs chronologically
      const mergedPrograms = [
        ...(out[found].programs || []),
        ...(ch.programs || []),
      ].sort((a, b) => new Date(a.start) - new Date(b.start));

      out[found] = {
        ...out[found],
        site_id: out[found].site_id || ch.site_id,
        logo: out[found].logo || ch.logo,
        programs: mergedPrograms,
      };
    } else {
      out.push(ch);
    }
  }

  console.log(`✅ Unified total: ${out.length} channels.`);
  return out;
}

// ====== MAIN ======
async function main() {
  try {
    const [samsung, blue] = await Promise.all([fetchSamsung(), fetchBlue()]);
    const merged = mergeAll(samsung, blue);
    await fs.writeFile(OUT_FILE, JSON.stringify(merged, null, 2), "utf8");
    console.log(`💾 Saved → ${OUT_FILE}`);
  } catch (err) {
    console.error("❌ Fatal error:", err);
    process.exit(1);
  }
}

main();
