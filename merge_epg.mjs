// merge_epg.mjs — stable baseline restored and extended with site_id support
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

// --- normalize base channel to your schema ---
function ensureChannelShape(ch) {
  const name = ch?.name || ch?.epgName || ch?.channel || "";
  const epgName = ch?.epgName || name;
  const logo = ch?.logo || ch?.image || null;
  const site_id = ch?.site_id ?? null;

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
    .filter((p) => p.start && p.end)
    .sort((a, b) => new Date(a.start) - new Date(b.start)); // ensure chronological

  return {
    site_id,
    name: String(name),
    epgName: String(epgName),
    logo: logo || undefined,
    programs,
  };
}

// --- helper: build RSI poster URL from a content node ---
function posterUrlFromContentPath(contentPath) {
  if (!contentPath) return null;
  const cp = String(contentPath).trim().replace(/^\/+/, "");
  return `${BASE}/content/images/${cp}_w1920.webp`;
}

// --- unified parser for tv.blue.ch responses ---
function buildRSIChannel(apiJson, publicName, siteIdOverride = null) {
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

  const logos = {
    "RSI 1": "https://upload.wikimedia.org/wikipedia/commons/8/8e/RSI_La_1_-_Logo_2020.svg",
    "RSI 2": "https://upload.wikimedia.org/wikipedia/commons/2/2e/RSI_La_2_-_Logo_2020.svg",
    "Rai Sport +": "https://upload.wikimedia.org/wikipedia/commons/a/a7/Rai_Sport_-_Logo_2018.svg",
    "Rai Gulp": "https://upload.wikimedia.org/wikipedia/commons/f/f0/Rai_Gulp_-_Logo_2017.svg",
    "La 7d": "https://upload.wikimedia.org/wikipedia/commons/2/26/La7d_-_Logo_2018.svg",
    "Sky TG 24": "https://upload.wikimedia.org/wikipedia/commons/3/3d/Sky_TG24_-_Logo_2021.svg",
  };

  // Prefer explicit override; else extract from API request identifiers.
  const extractedId = apiJson?.Request?.Identifiers?.[0] ?? null;
  const site_id = siteIdOverride ?? (extractedId != null ? String(extractedId) : null);

  return {
    site_id,
    name: publicName,
    epgName: publicName,
    logo: logos[publicName] || "",
    programs,
  };
}

async function main() {
  // 1) Load base master list (whatever you already publish publicly)
  let base = [];
  try {
    const raw = await fetchJson(PRIMARY_URL);
    base = Array.isArray(raw) ? raw : [];
  } catch (e) {
    console.error("Base list fetch failed:", e.message);
  }

  // Normalize early
  const out = base.map(ensureChannelShape);

  // 2) Date window (UTC 06:00 → next day 06:00)
  const today = new Date();
  const todayStr = ymdUTC(today);
  const tomorrowStr = ymdUTC(addDaysUTC(today, 1));
  const startParam = `${todayStr}0600`;
  const endParam = `${tomorrowStr}0600`;

  // 3) Known ids on tv.blue.ch
  const IDS = {
    RSI1: "356",
    RSI2: "357",
    RAISPORT: "338",
    RAIGULP: "332",
    LA7D: "239",
    SKYTG24: "393",
  };

  const url = (id) =>
    `${BASE}/catalog/tv/channels/list/(ids=${id};start=${startParam};end=${endParam};level=normal)`;

  const add = [];

  async function fetchAndAdd(id, publicName, aliases = []) {
    try {
      const j = await fetchJson(url(id));
      const ch = buildRSIChannel(j, publicName, id);
      if (!ch) {
        console.warn(`No programs for ${publicName} (${id})`);
        return;
      }
      add.push(ch);
      // Clone aliases with the SAME site_id so front-end can match by ID too
      for (const alias of aliases) {
        add.push({ ...ch, name: alias, epgName: alias });
      }
      console.log(`Merged ${publicName} (${id}) with ${ch.programs.length} programs`);
    } catch (e) {
      console.warn(`${publicName} (${id}) fetch failed:`, e.message);
    }
  }

  // 4) Fetch/merge sources
  await fetchAndAdd(IDS.RSI1, "RSI 1");
  await fetchAndAdd(IDS.RSI2, "RSI 2");
  await fetchAndAdd(IDS.RAISPORT, "Rai Sport +");
  await fetchAndAdd(IDS.RAIGULP, "Rai Gulp");
  await fetchAndAdd(IDS.LA7D, "La 7d", ["La7 Cinema"]); // keep alias with same site_id
  await fetchAndAdd(IDS.SKYTG24, "Sky TG 24");

  // 5) Merge into `out` (prefer site_id match; fallback to name)
  for (const c of add) {
    const safeC = ensureChannelShape(c);
    let i = -1;

    if (safeC.site_id) {
      i = out.findIndex((x) => String(x.site_id || "") === String(safeC.site_id));
    }
    if (i < 0) {
      i = out.findIndex(
        (x) => norm(x.name) === norm(safeC.name) || norm(x.epgName) === norm(safeC.epgName)
      );
    }

    if (i >= 0) {
      out[i] = {
        ...out[i],
        ...safeC,
        site_id: safeC.site_id ?? out[i].site_id ?? null,
        programs: safeC.programs, // override with fresh window
      };
    } else {
      out.push(safeC);
    }
  }

  // 6) Write final list
  await fs.writeFile("list.json", JSON.stringify(out, null, 2), "utf8");
  console.log(`✅ list.json written with ${out.length} channels (strict schema, ID-ready)`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
