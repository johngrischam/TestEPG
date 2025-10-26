// filter_epg.mjs
import fs from "fs/promises";
import { XMLParser } from "fast-xml-parser";

const SOURCE_URL = "https://raw.githubusercontent.com/matthuisman/i.mjh.nz/refs/heads/master/SamsungTVPlus/it.xml";
const TARGET_FILE = "filtered_epg.json";

// --- CHANNELS YOU WANT TO KEEP ---
const CHANNEL_IDS = [
  "IT3200004WU", "IT31000026G", "IT90001094", "IT500011RG", "IT900003FU",
  "IT900004Y5", "IT2600002F6", "IT2600010E0", "IT2600004K9", "IT2600007WQ",
  "IT2600006JG", "IT2600005ZN", "IT2600003FM", "IT260000131", "ITBD140000119",
  "ITBC1100002ZU", "ITBA33000238E", "IT300006W3", "ITBC1100008L4",
  "ITBA14000093A", "ITBC1100003KC", "ITBB20000072M", "ITBC1100001G5",
  "ITBD600001CL", "IT300007SE", "ITBD1000006RD", "IT2600008RA",
  "ITBA2200008IM", "ITBC4700002CO", "ITBA2200010O1", "ITBD1000002HF",
  "IT600001L6", "ITBC3000007XK", "IT4200001D8", "IT3200003YZ", "ITBD29000015E"
];

// --- FETCH + PARSE XML ---
async function main() {
  console.log("📡 Fetching full SamsungTVPlus Italy EPG...");
  const xmlText = await fetch(SOURCE_URL).then(r => r.text());
  console.log("✅ XML fetched. Parsing...");

  const parser = new XMLParser({ ignoreAttributes: false });
  const xml = parser.parse(xmlText);

  const allChannels = xml.tv.channel || [];
  const allPrograms = xml.tv.programme || [];

  console.log(`Total channels in source: ${allChannels.length}`);

  // --- Keep only channels you care about ---
  const filteredChannels = allChannels.filter(ch => CHANNEL_IDS.includes(ch["@_id"]));
  const filteredPrograms = allPrograms.filter(pr => CHANNEL_IDS.includes(pr["@_channel"]));

  console.log(`Keeping ${filteredChannels.length} channels and ${filteredPrograms.length} programmes.`);

  // --- Helper: extract text, preferring Italian ---
  const getText = (node, prefLang = "it") => {
    if (!node) return "";
    if (Array.isArray(node)) {
      const match = node.find(n => n["@_lang"] === prefLang);
      return match ? match["#text"] : node[0]["#text"];
    }
    return node["#text"] || "";
  };

  // --- Build structured output ---
  const data = filteredChannels.map(ch => {
    const id = ch["@_id"];
    const name = getText(ch["display-name"]);
    const logo = ch.icon?.["@_src"] || "";

    const programs = filteredPrograms
      .filter(p => p["@_channel"] === id)
      .map(p => ({
        title: getText(p.title),
        desc: getText(p.desc),
        start: p["@_start"],
        stop: p["@_stop"],
        icon: p.icon?.["@_src"] || logo
      }));

    return { id, name, icon: logo, programs };
  });

  await fs.writeFile(TARGET_FILE, JSON.stringify(data, null, 2));
  console.log(`💾 Saved ${data.length} channels to ${TARGET_FILE}`);
}

main().catch(err => {
  console.error("❌ Error while generating filtered EPG:", err);
});
