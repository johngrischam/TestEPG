// merge_all.mjs — Unified backend: SamsungTVPlus + Blue.ch (FAST PARALLEL + SAFE PARSING)
import fs from "fs/promises";
import { XMLParser } from "fast-xml-parser";

const OUT_FILE = "merged_all.json";
const SAMSUNG_URL =
  "https://raw.githubusercontent.com/matthuisman/i.mjh.nz/refs/heads/master/SamsungTVPlus/it.xml";
const BLUE_LIST_XML =
  "https://raw.githubusercontent.com/iptv-org/epg/refs/heads/master/sites/tv.blue.ch/tv.blue.ch.channels.xml";
const BLUE_BASE = "https://services.sg101.prd.sctv.ch";

function norm(str) {
  return String(str || "").toLowerCase().replace(/\s|-/g, "");
}
async function fetchText(url) {
  const r = await fetch(url, { headers: { "User-Agent": "merge_all-fast/1.3" } });
  if (!r.ok) throw new Error(`Fetch failed ${r.status}: ${url}`);
  return r.text();
}
async function fetchJson(url) {
  const r = await fetch(url, { headers: { "User-Agent": "merge_all-fast/1.3" } });
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
function posterUrlFromContentPath(contentPath) {
  if (!contentPath) return null;
  const cp = String(contentPath).trim().replace(/^\/+/, "");
  return `${BLUE_BASE}/content/images/${cp}_w1920.webp`;
}

// ---------------- SAMSUNG ----------------
async function fetchSamsung() {
  console.time("SamsungTVPlus");
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

  console.timeEnd("SamsungTVPlus");
  console.log(`✅ Samsung: ${data.length} channels`);
  return data;
}

// ---------------- BLUE.CH ----------------
async function fetchBlue() {
  console.time("Blue.ch");
  const xmlText = await fetchText(BLUE_LIST_XML);
  const parser = new XMLParser({ ignoreAttributes: false });
  const xml = parser.parse(xmlText);
  const channels = xml.channels?.channel || [];
  if (!Array.isArray(channels)) throw new Error("Invalid Blue.ch XML structure");

  const today = new Date();
  const startParam = `${ymdUTC(today)}0600`;
  const endParam = `${ymdUTC(addDaysUTC(today, 1))}0600`;

  const results = [];

  async function processChannel(ch) {
    try {
      const site_id = ch["@_site_id"];
      const rawName =
        ch["#text"] || ch["#cdata"] || ch["display-name"] || "";
      const name =
        typeof rawName === "string"
          ? rawName.trim()
          : String(rawName["#text"] || rawName || "").trim();

      if (!site_id) return null;

      const url = `${BLUE_BASE}/catalog/tv/channels/list/(ids=${site_id};start=${startParam};end=${endParam};level=normal)`;
      const json = await fetchJson(url);

      const items =
        json?.Nodes?.Items?.[0]?.Content?.Nodes?.Items ||
        json?.Nodes?.Items?.[0]?.Nodes?.Items ||
        [];
      if (!Array.isArray(items) || !items.length) return null;

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

          const nodes = b?.Content?.Nodes?.Items || [];
          const preferOrder = ["Lane", "Stage", "Landscape", "Title"];
          let poster = null;
          for (const role of preferOrder) {
            const n = nodes.find((x) => x?.Role === role && x?.ContentPath);
            if (n?.ContentPath) {
              poster = posterUrlFromContentPath(n.ContentPath);
              break;
            }
          }

          const title = desc.Title || "";
          const summary = desc.Summary || desc.ShortSummary || "";
          return { title, description: summary, start, end, poster };
        })
        .filter(Boolean);

      results.push({ site_id, name, logo: "", programs });
    } catch (e) {
      console.warn(`⚠️ ${ch["@_site_id"]}: ${e.message}`);
    }
  }

  // process 10 channels at a time
  const BATCH_SIZE = 10;
  for (let i = 0; i < channels.length; i += BATCH_SIZE) {
    const batch = channels.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(batch.map(processChannel));
  }

  console.timeEnd("Blue.ch");
  console.log(`✅ Blue.ch fetched: ${results.length} channels`);
  return results;
}

// ---------------- MERGE ----------------
function mergeAll(samsung, blue) {
  const out = [...samsung];
  for (const ch of blue) {
    const id = ch.site_id || "";
    const name = ch.name || "";
    let found = -1;

    if (id) {
      found = out.findIndex(
        (x) =>
          String(x.site_id || x.id || "") === String(id) ||
          String(x.id || x.site_id || "") === String(id)
      );
    }

    if (found < 0 && name) {
      found = out.findIndex((x) => norm(x.name) === norm(name));
    }

    if (found >= 0) {
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
  console.log(`✅ Unified: ${out.length} total channels`);
  return out;
}

// ---------------- MAIN ----------------
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

