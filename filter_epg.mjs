// filter_epg.mjs
import fs from "fs/promises";
import { XMLParser } from "fast-xml-parser";

const SOURCE_URL = "https://raw.githubusercontent.com/matthuisman/i.mjh.nz/refs/heads/master/SamsungTVPlus/it.xml";
const TARGET_FILE = "filtered_epg.json";

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

async function main() {
  console.log("📡 Fetching SamsungTVPlus Italy XML...");
  const xmlText = await fetch(SOURCE_URL).then(r => r.text());

  const parser = new XMLParser({
    ignoreAttributes: false,
    preserveOrder: false,
    cdataPropName: "_cdata",
    textNodeName: "#text",
  });

  const xml = parser.parse(xmlText);
  const allChannels = xml.tv.channel || [];
  const allPrograms = xml.tv.programme || [];

  console.log(`✅ Parsed: ${allChannels.length} channels, ${allPrograms.length} programs total.`);

  const filteredChannels = allChannels.filter(ch => CHANNEL_IDS.includes(ch["@_id"]));
  const filteredPrograms = allPrograms.filter(p => CHANNEL_IDS.includes(p["@_channel"]));

  console.log(`✅ Keeping ${filteredChannels.length} channels and ${filteredPrograms.length} programs.`);

  // helper: extract readable text
  function extractText(node, prefLang = "it") {
    if (!node) return "";
    if (typeof node === "string") return node.trim();
    if (Array.isArray(node)) {
      // handle multiple <title> or <desc> nodes with languages
      const match = node.find(n => n["@_lang"] === prefLang);
      return (
        extractText(match) ||
        extractText(node[0])
      );
    }
    // handle objects
    return (
      node["#text"] ||
      node["_text"] ||
      node["_cdata"] ||
      (typeof node === "object" ? Object.values(node).find(v => typeof v === "string") : "") ||
      ""
    ).toString().trim();
  }

  const data = filteredChannels.map(ch => {
    const id = ch["@_id"];
    const name = extractText(ch["display-name"]);
    const logo = ch.icon?.["@_src"] || "";

    const programs = filteredPrograms
      .filter(p => p["@_channel"] === id)
      .map(p => ({
        title: extractText(p.title),
        desc: extractText(p.desc),
        start: p["@_start"],
        stop: p["@_stop"],
        icon: p.icon?.["@_src"] || logo
      }));

    return { id, name, icon: logo, programs };
  });

  await fs.writeFile(TARGET_FILE, JSON.stringify(data, null, 2));
  console.log(`💾 Saved ${data.length} channels → ${TARGET_FILE}`);
}

main().catch(err => console.error("❌ Error:", err));

