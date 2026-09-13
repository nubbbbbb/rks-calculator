import fs from "node:fs/promises";
import JSON5 from "json5";

const API_URL =
  "https://phigros.fandom.com/api.php" +
  "?action=query" +
  "&prop=revisions" +
  "&titles=Phigros_Wiki:Song_Data" +
  "&rvslots=main" +
  "&rvprop=content" +
  "&format=json" +
  "&formatversion=2" +
  "&origin=*";

const DIFFICULTIES = [
  ["ez", "EZ"],
  ["hd", "HD"],
  ["in", "IN"],
  ["at", "AT"],
  ["legacy", "Legacy"],
  ["sp", "SP"],
];

function getContent(apiData) {
  const page = apiData?.query?.pages?.[0];
  const revision = page?.revisions?.[0];
  const slot = revision?.slots?.main;

  return slot?.content ?? slot?.["*"] ?? "";
}

function versionCompare(a, b) {
  const aa = String(a).split(".").map(Number);
  const bb = String(b).split(".").map(Number);

  for (let i = 0; i < Math.max(aa.length, bb.length); i++) {
    const x = aa[i] ?? 0;
    const y = bb[i] ?? 0;
    if (x !== y) return x - y;
  }

  return 0;
}

function makeCharts(songData) {
  const charts = [];

  for (const [key, song] of Object.entries(songData)) {
    if (!song || typeof song !== "object") continue;

    // Song Data contains historical entries (e.g. Introduction#2.5.0)
    // with display:false. Only current/displayed entries belong here.
    if (song.display === false) continue;

    const songName = song.title || key;

    for (const [field, diff] of DIFFICULTIES) {
      const chart = song[field];
      if (!chart || typeof chart !== "object") continue;

      const constant = Number(chart.level);
      if (!Number.isFinite(constant)) continue;

      charts.push({
        song: songName,
        diff,
        constant: Math.round(constant * 10) / 10,
        version: song.version || "",
        pack: song.pack || "",
        rksEligible: ["EZ", "HD", "IN", "AT"].includes(diff),
      });
    }
  }

  charts.sort((a, b) =>
    a.song.localeCompare(b.song) ||
    a.diff.localeCompare(b.diff)
  );

  return charts;
}

async function main() {
  console.log("Fetching Phigros Wiki Song Data…");

  const response = await fetch(API_URL, {
    headers: {
      "User-Agent": "Phigros-RKS-Calculator/1.0 (GitHub Pages)"
    }
  });

  if (!response.ok) {
    throw new Error(`Wiki API returned HTTP ${response.status}`);
  }

  const apiData = await response.json();
  const content = getContent(apiData);

  if (!content) {
    throw new Error("Wiki API returned no Song Data content.");
  }

  let songData;

  try {
    // The Wiki Song Data is JSON5-like, but it also contains
    // numeric object keys such as:
    //
    //   1: "Some Artist",
    //   2: "Another Artist"
    //
    // Numeric keys are not valid JSON5 identifiers, so quote them first.
    const normalizedContent = content.replace(
      /([,{]\s*)(\d+)(\s*:)/g,
      '$1"$2"$3'
    );

    songData = JSON5.parse(normalizedContent);
  } catch (error) {
    throw new Error(
      "The Wiki Song Data page could not be parsed: " + error.message
    );
  }

  const charts = makeCharts(songData);

  if (charts.length < 100) {
    throw new Error(
      `Only ${charts.length} charts were parsed; refusing to overwrite songs.json.`
    );
  }

  const versions = charts
    .map(c => c.version)
    .filter(Boolean)
    .sort(versionCompare);

  const sourceVersion = versions.at(-1) || "unknown";

  const output = {
    source: "Phigros Wiki:Song Data",
    sourceUrl: "https://phigros.fandom.com/wiki/Phigros_Wiki:Song_Data",
    sourceVersion,
    generatedAt: new Date().toISOString(),
    charts
  };

  await fs.writeFile(
    "songs.json",
    JSON.stringify(output, null, 2) + "\n",
    "utf8"
  );

  console.log(`Wrote ${charts.length} charts.`);
  console.log(`Newest chart version in dataset: ${sourceVersion}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});