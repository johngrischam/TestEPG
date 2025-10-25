// merge_epg.mjs
import fs from "fs/promises";

const PRIMARY_URL = "https://tvit.leicaflorianrobert.dev/epg/list.json";
const BASE = "https://services.sg101.prd.sctv.ch";
const norm = (s) => String(s || "").toLowerCase().replace(/\s|-/g, "");

// --- tiny utils ---
function ymdUTC(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}
function addDaysUTC(d, days) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days));
}
async function fetchJson(url) {
  const r = await fetch(url, { headers: { "User-Agent": "github-actions-merge-epg/1.0" } });
  if (!r.ok) throw new Error(`Fetch ${r.status} ${url}`);
  return r.json();
}

// --- normalize base channel to your schema (defensive, no shape changes to other channels) ---
function ensureChannelShape(ch) {
  const name = ch?.name || ch?.epgName || ch?.channel || "";
  const epgName = ch?.epgName || name;
  const logo = ch?.logo || ch?.image || null;
  const programsIn = Array.isArray(ch?.programs) ? ch.programs : [];

  const programs = programsIn
    .map((p) => {
      const title = p?.title || "";
      const description = p?.description ?? p?.desc ?? null;
      const start = p?.start ? new Date(p.start).toISOString() : null;
      const end = p?.end
        ? new Date(p.end).toISOString()
        : start
        ? new Date(new Date(start).getTime() + 60 * 60 * 1000).toISOString()
        : null;
      const poster = p?.poster ?? p?.image ?? null;
      return { title, description, start, end, poster };
    })
    .filter((p) => p.start && p.end);

  return { name: String(name), epgName: String(epgName), logo: logo || undefined, programs };
}

// --- helper: build RSI poster URL from a content node (confirmed working format) ---
function posterUrlFromContentPath(contentPath) {
  if (!contentPath) return null;
  // Example: tv/program/p20687899bh10aa_BannerL1 -> /content/images/tv/program/p20687899bh10aa_BannerL1_w1920.webp
  const cp = String(contentPath).trim().replace(/^\/+/, "");
  return `${BASE}/content/images/${cp}_w1920.webp`;
}

// --- RSI parser using Lane (preferred) -> Stage -> Landscape -> Title ---
function buildRSIChannel(apiJson, publicName) {
  const broadcasts =
    apiJson?.Nodes?.Items?.[0]?.Content?.Nodes?.Items ||
    apiJson?.Nodes?.Items?.[0]?.Nodes?.Items ||
    [];
  if (!Array.isArray(broadcasts) || !broadcasts.length) return null;

  const programs = broadcasts
    .slice(0, 50)
    .map((b) => {
      const desc = b?.Content?.Description || {};
      const avail = Array.isArray(b?.Availabilities) ? b.Availabilities[0] : null;
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
          if (poster) break;
        }
      }

      return {
        title: desc.Title || "",
        description: desc.Summary || desc.ShortSummary || "",
        start,
        end,
        poster: poster || null,
      };
    })
    .filter(Boolean);

  // Stable public logos for frontend fallback
  const logo =
    publicName === "RSI 1"
      ? "https://upload.wikimedia.org/wikipedia/commons/8/8e/RSI_La_1_-_Logo_2020.svg"
      : publicName === "RSI 2"
      ? "https://upload.wikimedia.org/wikipedia/commons/2/2e/RSI_La_2_-_Logo_2020.svg"
      : "https://upload.wikimedia.org/wikipedia/commons/a/a7/Rai_Sport_-_Logo_2018.svg";

  return { name: publicName, epgName: publicName, logo, programs };
}

// --- main ---
async function main() {
  // 1) Load base list
  let base;
  try {
    const raw = await fetchJson(PRIMARY_URL);
    base = Array.isArray(raw) ? raw : [];
  } catch (e) {
    console.error("Base list fetch failed:", e.message);
    base = [];
  }

  const out = base.map(ensureChannelShape);

  // 2) Date window (UTC 06:00 → next day 06:00)
  const today = new Date();
  const todayStr = ymdUTC(today);
  const tomorrowStr = ymdUTC(addDaysUTC(today, 1));
  const startParam = `${todayStr}0600`;
  const endParam = `${tomorrowStr}0600`;

  // 3) RSI + Rai Sport + sources (all from tv.blue.ch)
  const RSI1_URL = `${BASE}/catalog/tv/channels/list/(ids=356;start=${startParam};end=${endParam};level=normal)`;
  const RSI2_URL = `${BASE}/catalog/tv/channels/list/(ids=357;start=${startParam};end=${endParam};level=normal)`;
  const RAISPORT_URL = `${BASE}/catalog/tv/channels/list/(ids=338;start=${startParam};end=${endParam};level=normal)`;

  const add = [];

  // --- Unified fetch for RSI + Rai Sport +
  async function fetchRSI(url, name) {
    try {
      const j = await fetchJson(url);
      const ch = buildRSIChannel(j, name);
      if (ch) {
        add.push(ch);
        console.log(`Merged ${name} with ${ch.programs.length} programs`);
      } else {
        console.warn(`No programs for ${name}`);
      }
    } catch (e) {
      console.warn(`${name} fetch failed:`, e.message);
    }
  }

  await fetchRSI(RSI1_URL, "RSI 1");
  await fetchRSI(RSI2_URL, "RSI 2");
  await fetchRSI(RAISPORT_URL, "Rai Sport +");

  // 4) Merge into out
  for (const c of add) {
    const i = out.findIndex(
      (x) => norm(x.name) === norm(c.name) || norm(x.epgName) === norm(c.epgName)
    );
    const safeC = ensureChannelShape(c);
    if (i >= 0) out[i] = { ...out[i], ...safeC, programs: safeC.programs };
    else out.push(safeC);
  }

  // 5) Write final list
  await fs.writeFile("list.json", JSON.stringify(out, null, 2), "utf8");
  console.log(`✅ list.json written with ${out.length} channels (strict schema)`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});







