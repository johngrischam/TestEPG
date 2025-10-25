import fs from "fs";
import { XMLParser, XMLBuilder } from "fast-xml-parser";

const SOURCE_URL = "https://cdn.jsdelivr.net/gh/matthuisman/i.mjh.nz/SamsungTVPlus/it.xml";
const OUTPUT_FILE = "filtered.xml";

// Load wanted channel IDs (one per line)
const channels = fs
  .readFileSync("channels.txt", "utf8")
  .split(/\r?\n/)
  .map((x) => x.trim())
  .filter(Boolean);

async function main() {
  console.log("Downloading SamsungTVPlus XML…");
  const res = await fetch(SOURCE_URL, {
    headers: { "User-Agent": "github-actions-filter-samsung/1.0" },
  });
  if (!res.ok) throw new Error(`Fetch ${res.status} ${SOURCE_URL}`);
  const xmlText = await res.text();

  // IMPORTANT: force attributes with NO prefix, so we get .id and .channel
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",   // <-- make attributes plain keys: id, channel, start, stop
    trimValues: true
  });
  const data = parser.parse(xmlText);
  const tv = data?.tv || {};

  // Normalize channel/programme to arrays
  const chanArr = Array.isArray(tv.channel) ? tv.channel : (tv.channel ? [tv.channel] : []);
  const progArr = Array.isArray(tv.programme) ? tv.programme : (tv.programme ? [tv.programme] : []);

  // Filter channels by id
  const filteredChannels = chanArr.filter((ch) => {
    const id = (ch?.id || "").trim();
    return id && channels.includes(id);
  });

  // Filter programmes by channel attribute
  const filteredPrograms = progArr.filter((p) => {
    const cid = (p?.channel || "").trim();
    return cid && channels.includes(cid);
  });

  console.log(`📺 Channels in source: ${chanArr.length}`);
  console.log(`🎬 Programmes in source: ${progArr.length}`);
  console.log(`✅ Channels kept: ${filteredChannels.length}`);
  console.log(`✅ Programmes kept: ${filteredPrograms.length}`);

  // Build output preserving <tv> root & generator attrs if present
  const output = {
    tv: {
      ...(tv || {}),
      channel: filteredChannels,
      programme: filteredPrograms,
    },
  };

  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: "",   // keep attributes plain in output too
  });
  const xmlOut = builder.build(output);

  fs.writeFileSync(OUTPUT_FILE, xmlOut, "utf8");
  console.log(`✅ Filtered XML written to ${OUTPUT_FILE}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

  console.error("Fatal:", err);
  process.exit(1);
});
