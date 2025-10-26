// filter_epg.mjs
import fs from "fs/promises";
import { XMLParser } from "fast-xml-parser";

const SOURCE_URL = "https://raw.githubusercontent.com/matthuisman/i.mjh.nz/refs/heads/master/SamsungTVPlus/it.xml";
const TARGET_FILE = "filtered_epg.json";

// your EPG IDs (extracted from your HTML)
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

function normalize(str) {
  return String(str || "").toLowerCase().replace(/\s|-/g, "");
}

function parseXMLTVtime(str) {
  if (!str) return 0;
  const date = str.slice(0, 14);
  const year = date.slice(0, 4);
  const month = date.slice(4, 6);
  const day = date.slice(6, 8);
  const hour = date.slice(8, 10);
  const minute = date.slice(10, 12);
  const second = date.slice(12, 14);
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second)).getTime();
}

async function main() {
  console.log("Fetching full EPG...");
  const xmlText = await fetch(SOURCE_URL).then(r => r.text());
  const parser = new XMLParser({ ignoreAttributes: false });
  const xml = parser.parse(xmlText);

  const allChannels = xml.tv.channel || [];
  const allPrograms = xml.tv.programme || [];

  console.log(`Total channels in source: ${allChannels.length}`);

  const filteredChannels = allChannels.filter(ch => {
    const id = ch["@_id"];
    return CHANNEL_IDS.includes(id);
  });

  const filteredPrograms = allPrograms.filter(pr => {
    const cid = pr["@_channel"];
    return CHANNEL_IDS.includes(cid);
  });

  const data = filteredChannels.map(ch => {
    const id = ch["@_id"];
    const name = ch["display-name"]?.["#text"] || "";
    const icon = ch.icon?.["@_src"] || "";
    const programs = filteredPrograms
      .filter(p => p["@_channel"] === id)
      .map(p => ({
        title: p.title?.["#text"] || "",
        desc: p.desc?.["#text"] || "",
        start: p["@_start"],
        stop: p["@_stop"],
        icon: p.icon?.["@_src"] || icon
      }));
    return { id, name, icon, programs };
  });

  await fs.writeFile(TARGET_FILE, JSON.stringify(data, null, 2));
  console.log(`✅ Saved ${filteredChannels.length} channels to ${TARGET_FILE}`);
}

main().catch(console.error);
