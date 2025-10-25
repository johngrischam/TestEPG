// merge_epg.mjs
// Merges: primary list.json + Rai Sport (epg.pw) + RSI 1 & RSI 2 (sctv)
// Works with Node 20+ (GitHub Actions default)

import fs from 'fs/promises';

const PRIMARY_URL = 'https://tvit.leicaflorianrobert.dev/epg/list.json';

const normalize = (s) => String(s || '').toLowerCase().replace(/\s|-/g, '');

function ymdUTC(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function atUTC(d, h=0, min=0) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, min));
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'github-actions-merge-epg/1.0' } });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} ${url}`);
  return await res.json();
}

// ---------- Rai Sport ----------
function buildRaiSport(epgPwJson) {
  const list = Array.isArray(epgPwJson?.epg_list) ? epgPwJson.epg_list : [];
  const programs = list.map((item, idx) => {
    const start = new Date(item.start_date);
    const end = (idx < list.length - 1)
      ? new Date(list[idx + 1].start_date)
      : new Date(start.getTime() + 60 * 60 * 1000);
    return { title: item.title || '', description: item.desc || null, start: start.toISOString(), end: end.toISOString(), poster: null };
  });
  return { name: 'Rai Sport', epgName: epgPwJson?.name || 'RAI Sport', logo: epgPwJson?.icon || '', source: 'epg.pw', programs };
}

// ---------- RSI ----------
function buildRSI(apiJson, name, id) {
  const ch = apiJson?.channels?.[0];
  if (!ch || !Array.isArray(ch.programs)) return null;
  const programs = ch.programs.map(p => ({
    title: p.title || '',
    description: p.description || null,
    start: new Date(p.start).toISOString(),
    end: new Date(p.end).toISOString(),
    poster: p.image || null
  }));
  return { name, epgName: name, logo: ch.image || '', source: `sctv-${id}`, programs };
}

// ---------- Main ----------
async function main() {
  const today = new Date();
  const todayUTC = ymdUTC(today);
  const tomorrowUTC = ymdUTC(new Date(atUTC(today, 0, 0).getTime() + 24*60*60*1000));
  const startParam = `${todayUTC}0600`;
  const endParam   = `${tomorrowUTC}0600`;

  const RAI_URL = `https://epg.pw/api/epg.json?lang=en&date=${todayUTC}&channel_id=392165`;
  const RSI1_URL = `https://services.sg101.prd.sctv.ch/catalog/tv/channels/list/(ids=356;start=${startParam};end=${endParam};level=normal)`;
  const RSI2_URL = `https://services.sg101.prd.sctv.ch/catalog/tv/channels/list/(ids=357;start=${startParam};end=${endParam};level=normal)`;

  const primary = await fetchJson(PRIMARY_URL);
  const channels = Array.isArray(primary) ? primary : [];

  // Rai Sport
  try {
    const rai = buildRaiSport(await fetchJson(RAI_URL));
    const i = channels.findIndex(ch => normalize(ch.name) === 'raisport');
    if (i >= 0) channels[i] = { ...channels[i], ...rai };
    else channels.push(rai);
    console.log('Merged Rai Sport ✅');
  } catch (e) {
    console.warn('Rai Sport failed:', e.message);
  }

  // RSI 1 and RSI 2
  for (const def of [
    { id: 356, name: 'RSI 1', url: RSI1_URL },
    { id: 357, name: 'RSI 2', url: RSI2_URL }
  ]) {
    try {
      const rsi = buildRSI(await fetchJson(def.url), def.name, def.id);
      if (rsi) {
        const i = channels.findIndex(ch => normalize(ch.name) === normalize(def.name));
        if (i >= 0) channels[i] = { ...channels[i], ...rsi };
        else channels.push(rsi);
        console.log(`Merged ${def.name} ✅`);
      } else console.warn(`No programs for ${def.name}`);
    } catch (e) {
      console.warn(`${def.name} failed:`, e.message);
    }
  }

  await fs.writeFile('list.json', JSON.stringify(channels, null, 2), 'utf8');
  console.log(`✅ list.json written (${channels.length} channels)`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
