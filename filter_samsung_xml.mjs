// filter_samsung_xml.mjs
import fs from "fs/promises";
import { XMLParser, XMLBuilder } from "fast-xml-parser";

const SOURCE_URL = "https://cdn.jsdelivr.net/gh/matthuisman/i.mjh.nz/SamsungTVPlus/it.xml";
const CHANNELS_FILE = "./channels.txt";

async function fetchText(url) {
  const r = await fetch(url, { headers: { "User-Agent": "github-actions-filter-samsung/1.0" } });
  if (!r.ok) throw new Error(`Fetch ${r.status} ${url}`);
  return r.text();
}

async function main() {
  const xmlText = await fetchText(SOURCE_URL);
  const wantedIds = (await fs.readFile(CHANNELS_FILE, "utf8"))
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);

  console.log("Keeping", wantedIds.length, "channels");

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
  const xml = parser.parse(xmlText);
  const tv = xml?.tv || {};

  const channels = Array.isArray(tv.channel) ? tv.channel : (tv.channel ? [tv.channel] : []);
  const programmes = Array.isArray(tv.programme) ? tv.programme : (tv.programme ? [tv.programme] : []);

  const filteredChannels = channels.filter((c) => wantedIds.includes(c.id));
  const filteredProgs = programmes.filter((p) => wantedIds.includes(p.channel));

  const filtered = { tv: { channel: filteredChannels, programme: filteredProgs } };

  const builder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: "" });
  const xmlOut = builder.build(filtered);

  await fs.writeFile("filtered.xml", xmlOut, "utf8");
  console.log("✅ filtered.xml written with", filteredChannels.length, "channels and", filteredProgs.length, "programmes");
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
