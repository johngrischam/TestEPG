import fs from "fs";
import { XMLParser, XMLBuilder } from "fast-xml-parser";

const channels = fs
  .readFileSync("channels.txt", "utf8")
  .split("\n")
  .map((x) => x.trim())
  .filter(Boolean);

const SOURCE_URL = "https://cdn.jsdelivr.net/gh/matthuisman/i.mjh.nz/SamsungTVPlus/it.xml";
const OUTPUT_FILE = "filtered.xml";

async function main() {
  console.log("Downloading SamsungTVPlus XML…");
  const res = await fetch(SOURCE_URL);
  const xmlText = await res.text();

  const parser = new XMLParser({ ignoreAttributes: false });
  const data = parser.parse(xmlText);

  // ✅ filter <channel> list safely
  const filteredChannels = (data.tv.channel || []).filter((ch) =>
    channels.includes(ch["@_id"]?.trim?.() || ch.id || "")
  );

  // ✅ filter <programme> list safely by channel attribute
  const filteredPrograms = (data.tv.programme || []).filter((p) => {
    const chAttr = p["@_channel"]?.trim?.() || p.channel || "";
    return channels.includes(chAttr);
  });

  console.log(`📺 Channels kept: ${filteredChannels.length}`);
  console.log(`🎬 Programmes kept: ${filteredPrograms.length}`);

  const output = {
    tv: {
      ...data.tv,
      channel: filteredChannels,
      programme: filteredPrograms,
    },
  };

  const builder = new XMLBuilder({ ignoreAttributes: false });
  const xmlOut = builder.build(output);

  fs.writeFileSync(OUTPUT_FILE, xmlOut, "utf8");
  console.log(`✅ Filtered XML written to ${OUTPUT_FILE}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
