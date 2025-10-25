import fs from "fs/promises";

const PRIMARY_URL = "https://tvit.leicaflorianrobert.dev/epg/list.json";

const norm = (s) => String(s || "").toLowerCase().replace(/\s|-/g, "");

// --- tiny utils ---
function ymdUTC(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}
function addDaysUTC(d, days) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()));
}
async function fetchJson(url) {
  const r = await fetch(url, { headers: { "User-Agent": "github-actions-merge-epg/1.0" } });
  if (!r.ok) throw new Error(`Fetch ${r.status} ${url}`);
  return r.json();
}

// --- normalize base channel to your schema (defensive) ---
function ensureChannelShape(ch) {
  // Some sources may have different keys, force the shape your site expects.
  const name = ch?.name || ch?.epgName || ch?.channel || "";
  const epgName = ch?.epgName || name;
  const logo = ch?.logo || ch?.image || null;
  const programsIn = Array.isArray(ch?.programs) ? ch.programs : [];

  const programs = programsIn.map((p) => {
    // Accept a few common keys then force output keys
    const title = p?.title || "";
    const description = p?.description ?? p?.desc ?? null;
    const start = p?.start ? new Date(p.start).toISOString() : null;
    // If end missing, assume +60m
    const end = p?.end ? new Date(p.end).toISOString() : (start ? new Date(new Date(start).getTime() + 60 * 60 * 1000).toISOString() : null);
    const poster = p?.poster ?? p?.image ?? null;
    return { title, description, start, end, poster };
  }).filter(p => p.start && p.end);

  return {
    name: String(name),
    epgName: String(epgName),
    logo: logo || undefined,
    programs
  };
}

// --- Build channels from the three extra sources ---
function buildRaiSport(epgPwJson) {
  const list = Array.isArray(epgPwJson?.epg_list) ? epgPwJson.epg_list.slice(0, 50) : [];
  const programs = list.map((item, idx, arr) => {
    const start = new Date(item.start_date);
    const end = idx < arr.length - 1 ? new Date(arr[idx + 1].start_date) : new Date(start.getTime() + 60 * 60 * 1000);
    return {
      title: item.title || "",
      description: item.desc ?? null,
      start: start.toISOString(),
      end: end.toISOString(),
      poster: null
    };
  });
  return {
    name: "Rai Sport",
    epgName: "Rai Sport",
    logo: epgPwJson?.icon || "",
    programs
  };
}

function buildRSIChannel(apiJson, publicName) {
  const ch = apiJson?.channels?.[0];
  if (!ch || !Array.isArray(ch.programs)) return null;
  const programs = ch.programs.slice(0, 50).map((p, i, arr) => {
    // p.start / p.end should already be ISO or ISO-like; force ISO
    const start = new Date(p.start);
    const end = new Date(p.end);
    return {
      title: p.title || "",
      description: p.description ?? null,
      start: start.toISOString(),
      end: end.toISOString(),
      poster: p.image || null
    };
  }).filter(p => p.start && p.end);

  return {
    name: publicName,
    epgName: publicName,
    logo: ch.image || "",
    programs
  };
}

async function main() {
  // 1) Load base list (must be an array)
  let base;
  try {
    const raw = await fetchJson(PRIMARY_URL);
    base = Array.isArray(raw) ? raw : [];
  } catch (e) {
    console.error("Base list fetch failed:", e.message);
    base = [];
  }

  // Force base into your exact shape (defensive; prevents rogue/flat objects)
  const out = base.map(ensureChannelShape);

  // 2) Prepare dates (UTC 06:00 → next day 06:00)
  const today = new Date();
  const todayStr = ymdUTC(today);
  const tomorrowStr = ymdUTC(addDaysUTC(today, 1));
  const startParam = `${todayStr}0600`;
  const endParam = `${tomorrowStr}0600`;

  // 3) Fetch the 3 sources
  const RAI_URL = `https://epg.pw/api/epg.json?lang=en&date=${todayStr}&channel_id=392165`;
  const RSI1_URL = `https://services.sg101.prd.sctv.ch/catalog/tv/channels/list/(ids=356;start=${startParam};end=${endParam};level=normal)`;
  const RSI2_URL = `https://services.sg101.prd.sctv.ch/catalog/tv/channels/list/(ids=357;start=${startParam};end=${endParam};level=normal)`;

  const add = [];

  try {
    const raiJson = await fetchJson(RAI_URL);
    const rai = buildRaiSport(raiJson);
    add.push(rai);
    console.log("Merged Rai Sport");
  } catch (e) {
    console.warn("Rai Sport fetch failed:", e.message);
  }

  async function fetchRSI(url, name) {
    try {
      const j = await fetchJson(url);
      const ch = buildRSIChannel(j, name);
      if (ch) { add.push(ch); console.log(`Merged ${name}`); }
      else console.warn(`No programs for ${name}`);
    } catch (e) {
      console.warn(`${name} fetch failed:`, e.message);
    }
  }
  await Promise.all([fetchRSI(RSI1_URL, "RSI 1"), fetchRSI(RSI2_URL, "RSI 2")]);

  // 4) Merge/replace into out
  for (const c of add) {
    const i = out.findIndex(x => norm(x.name) === norm(c.name) || norm(x.epgName) === norm(c.epgName));
    const safeC = ensureChannelShape(c); // enforce exact shape
    if (i >= 0) out[i] = { ...out[i], ...safeC, programs: safeC.programs }; // replace programs
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
