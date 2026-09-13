import fs from "node:fs/promises";
import JSON5 from "json5";

const WIKI_BASE_URL = "https://phigros.fandom.com/wiki";
const API_URL = "https://phigros.fandom.com/api.php";
const USER_AGENT = "Phigros-RKS-Calculator/1.0 (GitHub Pages)";

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

// Batch-fetches page image thumbnails (jackets) from Fandom API for given titles
async function fetchJacketUrls(titles) {
  const jacketMap = new Map();
  const chunkSize = 50; // MediaWiki API limit for titles parameter

  for (let i = 0; i < titles.length; i += chunkSize) {
    const chunk = titles.slice(i, i + chunkSize);
    const params = new URLSearchParams({
      action: "query",
      titles: chunk.join("|"),
      prop: "pageimages",
      piprop: "original|thumbnail",
      pithumbsize: "500",
      format: "json",
      formatversion: "2",
      origin: "*",
    });

    const res = await fetch(`${API_URL}?${params.toString()}`, {
      headers: { "User-Agent": USER_AGENT },
    });

    if (!res.ok) continue;

    const data = await res.json();
    const pages = data?.query?.pages || [];

    for (const page of pages) {
      if (page.title) {
        // Fallback to original image if thumbnail fails
        const imageUrl = page.original?.source || page.thumbnail?.source || "";
        jacketMap.set(page.title, imageUrl);
      }
    }
  }

  return jacketMap;
}

function parseSongs(songData) {
  const songs = [];
  const versions = [];

  for (const [key, song] of Object.entries(songData)) {
    if (!song || typeof song !== "object") continue;

    // Skip historical/hidden entries
    if (song.display === false) continue;

    const name = song.title || key;
    const charts = [];

    for (const [field, diff] of DIFFICULTIES) {
      const chart = song[field];
      if (!chart || typeof chart !== "object") continue;

      const constant = Number(chart.level);
      if (!Number.isFinite(constant)) continue;

      charts.push({
        diff,
        constant: Math.round(constant * 10) / 10,
      });
    }

    if (charts.length === 0) continue;

    if (song.version) {
      versions.push(song.version);
    }

    // Build wiki URL safe path
    const wikiPath = encodeURIComponent(name.replace(/ /g, "_"));

    songs.push({
      name,
      chapter: song.pack || "",
      wikiUrl: `${WIKI_BASE_URL}/${wikiPath}`,
      jacket: "", // Populated in next step
      charts,
    });
  }

  songs.sort((a, b) => a.name.localeCompare(b.name));

  return { songs, versions };
}

async function main() {
  console.log("1. Fetching Phigros Wiki Song Data…");

  const dataUrl =
    `${API_URL}?action=query&prop=revisions&titles=Phigros_Wiki:Song_Data` +
    `&rvslots=main&rvprop=content&format=json&formatversion=2&origin=*`;

  const response = await fetch(dataUrl, {
    headers: { "User-Agent": USER_AGENT },
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
    // Quote numeric object keys for JSON5 compatibility
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

  const { songs, versions } = parseSongs(songData);

  if (songs.length < 50) {
    throw new Error(
      `Only ${songs.length} songs were parsed; refusing to overwrite songs.json.`
    );
  }

  console.log(`2. Fetching jacket images for ${songs.length} songs…`);
  const songTitles = songs.map((s) => s.name);
  const jacketMap = await fetchJacketUrls(songTitles);

  // Assign jacket URLs
  for (const song of songs) {
    song.jacket = jacketMap.get(song.name) || "";
  }

  const sortedVersions = versions.filter(Boolean).sort(versionCompare);
  const sourceVersion = sortedVersions.at(-1) || "unknown";

  const output = {
    source: "Phigros Wiki (Song Data + Songs + page images)",
    sourceUrl: `${WIKI_BASE_URL}/Songs`,
    sourceVersion,
    generatedAt: new Date().toISOString(),
    songs,
  };

  await fs.writeFile(
    "songs.json",
    JSON.stringify(output, null, 2) + "\n",
    "utf8"
  );

  console.log(`Successfully wrote ${songs.length} songs to songs.json.`);
  console.log(`Newest version detected: ${sourceVersion}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});