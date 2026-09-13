const SCORE_KEY = "phigros-rks-scores-v2";
const UI_KEY = "phigros-rks-ui-v1";
const SONGS_KEY = "phigros-rks-custom-songs-v1";
const WIKI_BASE = "https://phigros.fandom.com";

const ELIGIBLE_DIFFS = ["EZ", "HD", "IN", "AT"];
const ALL_DIFFS = ["EZ", "HD", "IN", "AT", "SP", "Legacy"];
const SPECIAL_DIFFS = ["SP", "Legacy"];
const SONG_JACKET_HEIGHT = 90; // left-panel song cards always use the compact size

const DEFAULT_UI = {
  leftWidth: 380,
  diffFilters: ["EZ", "HD", "IN", "AT"],
  sortMode: "song",
  searchText: "",
};

let songs = [];   // all songs, entered manually: [{name, wikiUrl, jacket, charts:[{diff,constant}]}]
let charts = [];  // flattened: [{song, diff, constant, jacket, wikiUrl, rksEligible}]
let scores = {};
let ui = { ...DEFAULT_UI };
let selected = { song: null, diff: null };
let editingSongName = null; // name of the song currently open in the modal, or null when adding a new one

const $ = id => document.getElementById(id);

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function loadScores() {
  try {
    scores = JSON.parse(localStorage.getItem(SCORE_KEY) || "{}");
  } catch {
    scores = {};
  }
}

function saveScores() {
  localStorage.setItem(SCORE_KEY, JSON.stringify(scores));
}

function loadUi() {
  try {
    const stored = JSON.parse(localStorage.getItem(UI_KEY) || "{}");
    ui = { ...DEFAULT_UI, ...stored };
    if (!Array.isArray(ui.diffFilters) || !ui.diffFilters.length) {
      ui.diffFilters = [...DEFAULT_UI.diffFilters];
    }
  } catch {
    ui = { ...DEFAULT_UI };
  }
}

function saveUi() {
  localStorage.setItem(UI_KEY, JSON.stringify(ui));
}

function loadSongs() {
  try {
    const stored = JSON.parse(localStorage.getItem(SONGS_KEY) || "[]");
    songs = Array.isArray(stored) ? stored : [];
  } catch {
    songs = [];
  }
  rebuildCharts();
}

function saveSongs() {
  localStorage.setItem(SONGS_KEY, JSON.stringify(songs));
}

// Rebuilds the flattened chart list (and the on-screen counters/status) any
// time `songs` changes. Call after every add/edit/delete.
function rebuildCharts() {
  charts = flatten(songs);
  const chartCountEl = $("chartCount");
  if (chartCountEl) chartCountEl.textContent = charts.length;
  $("dataStatus").textContent = songs.length
    ? `${songs.length} song${songs.length === 1 ? "" : "s"} · ${charts.length} chart${charts.length === 1 ? "" : "s"}`
    : `No songs yet — click "+ Add song" to get started.`;
}

// ---------------------------------------------------------------------------
// RKS math (unchanged formula, now driven off the flattened chart list)
// ---------------------------------------------------------------------------

function chartKey(c) {
  return `${c.song}\u0000${c.diff}`;
}

function isRksEligible(c) {
  return ELIGIBLE_DIFFS.includes(c.diff);
}

function singleRks(c) {
  if (!isRksEligible(c)) return 0;
  const acc = scores[chartKey(c)];
  if (acc == null || !Number.isFinite(Number(acc)) || Number(acc) < 70) return 0;
  return c.constant * Math.pow((Number(acc) - 55) / 45, 2);
}

function isPhi(c) {
  if (!isRksEligible(c)) return false;
  const acc = scores[chartKey(c)];
  return acc != null && Number(acc) >= 99.999999;
}

function calculate() {
  const played = charts.filter(c => isRksEligible(c) && scores[chartKey(c)] != null);

  const b27 = [...played].sort((a, b) => singleRks(b) - singleRks(a)).slice(0, 27);
  const p3 = [...played].filter(isPhi).sort((a, b) => b.constant - a.constant).slice(0, 3);

  const b27Sum = b27.reduce((s, c) => s + singleRks(c), 0);
  const p3Sum = p3.reduce((s, c) => s + c.constant, 0);

  // Union of B27 + P3 for the "contributing charts" list, tagged by source.
  const tagged = new Map();
  for (const c of b27) tagged.set(chartKey(c), { chart: c, tags: new Set(["B27"]) });
  for (const c of p3) {
    const key = chartKey(c);
    if (tagged.has(key)) tagged.get(key).tags.add("P3");
    else tagged.set(key, { chart: c, tags: new Set(["P3"]) });
  }
  const contributing = [...tagged.values()].sort(
    (a, b) => singleRks(b.chart) - singleRks(a.chart)
  );

  return {
    played, b27, p3, b27Sum, p3Sum, contributing,
    rks: (b27Sum + p3Sum) / 30,
  };
}

// ---------------------------------------------------------------------------
// Jacket art with graceful fallback
// ---------------------------------------------------------------------------

function initials(name) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  return (words[0][0] + (words[1]?.[0] || "")).toUpperCase();
}

function jacketHtml(c, size, fill = false) {
  const label = initials(c.song);
  const style = fill ? `width:100%;height:100%` : `width:${size}px;height:${size}px`;
  // The song's initials sit behind the <img> as a CSS ::before; if the
  // image is missing or fails to load, hiding it just reveals the initials.
  // referrerpolicy="no-referrer" works around Fandom's CDN rejecting image
  // requests whose Referer header isn't a fandom.com page (hotlink protection).
  const img = c.jacket
    ? `<img src="${escapeAttr(c.jacket)}" alt="" loading="lazy" referrerpolicy="no-referrer"
         onerror="console.error('[jacket debug] failed to load image:', this.src); this.style.display='none'">`
    : "";
  return `<div class="jacket" style="${style}" data-initials="${escapeAttr(label)}">${img}</div>`;
}

// ---------------------------------------------------------------------------
// Top: RKS value + B27/P3 contribution breakdown
// ---------------------------------------------------------------------------

function renderTop() {
  const r = calculate();
  const total = r.b27Sum + r.p3Sum;
  const b27Pct = total > 0 ? (r.b27Sum / total) * 100 : 0;
  const p3Pct = total > 0 ? (r.p3Sum / total) * 100 : 0;

  $("rksValue").textContent = r.rks.toFixed(2);
  const scoreCountEl = $("scoreCount");
  const phiCountEl = $("phiCount");
  if (scoreCountEl) scoreCountEl.textContent = r.played.length;
  if (phiCountEl) phiCountEl.textContent = r.played.filter(isPhi).length;
  $("rksDetail").textContent = `${r.b27.length}/27 B27 charts + ${r.p3.length}/3 P3 charts`;

  $("b27Sum").textContent = r.b27Sum.toFixed(4);
  $("p3Sum").textContent = r.p3Sum.toFixed(4);
  $("b27Pct").textContent = total > 0 ? `${b27Pct.toFixed(1)}% of RKS` : "—";
  $("p3Pct").textContent = total > 0 ? `${p3Pct.toFixed(1)}% of RKS` : "—";

  $("breakdownB27").style.width = `${b27Pct}%`;
  $("breakdownP3").style.width = `${p3Pct}%`;

  return r;
}

// ---------------------------------------------------------------------------
// Middle: contributing charts, 3 columns x up to 10 rows, scrollable
// ---------------------------------------------------------------------------

function renderMiddle(r) {
  const el = $("contribGrid");

  if (!r.contributing.length) {
    el.className = "contribGrid empty";
    el.textContent = "Enter some ACCs to see which charts contribute to your RKS.";
    return;
  }

  el.className = "contribGrid";
  el.innerHTML = r.contributing.slice(0, 30).map(({ chart: c, tags }) => {
    const acc = Number(scores[chartKey(c)]);
    const tagLabel = [...tags].join("+");
    const isSelected = selected.song === c.song && selected.diff === c.diff;
    return `
      <button type="button" class="contribCard${isSelected ? " selected" : ""}" data-song="${escapeAttr(c.song)}" data-diff="${escapeAttr(c.diff)}">
        ${jacketHtml(c, 40)}
        <div class="contribInfo">
          <div class="contribTitle" title="${escapeAttr(c.song)}">${escapeHtml(c.song)}</div>
          <div class="contribMeta">
            <span class="diffBadge diff-${escapeAttr(c.diff)}">${escapeHtml(c.diff)} ${c.constant.toFixed(1)}</span>
            <span class="tagBadge">${escapeHtml(tagLabel)}</span>
          </div>
        </div>
        <div class="contribRks">${singleRks(c).toFixed(3)}</div>
      </button>`;
  }).join("");

  el.querySelectorAll(".contribCard").forEach(card => {
    card.addEventListener("click", () => {
      select(card.dataset.song, card.dataset.diff);
    });
  });
}

// ---------------------------------------------------------------------------
// Bottom: selected-song editor
// ---------------------------------------------------------------------------

function select(songName, diff) {
  const song = songs.find(s => s.name === songName);
  if (!song) return;

  selected.song = songName;
  // Keep the requested diff if that chart exists, otherwise fall back to
  // the first available chart on this song.
  selected.diff = song.charts.some(c => c.diff === diff) ? diff : song.charts[0]?.diff ?? null;

  renderBottom();
  renderSongs();
  renderAll();
}

function renderBottom() {
  const el = $("bottomDiv");
  const song = songs.find(s => s.name === selected.song);

  if (!song) {
    el.innerHTML = `<div class="empty">Select a song from the list on the left to edit its accuracy.</div>`;
    return;
  }

  const chart = song.charts.find(c => c.diff === selected.diff) || song.charts[0];
  const flat = { song: song.name, diff: chart.diff, constant: chart.constant };
  const key = chartKey(flat);
  const acc = scores[key];
  const eligible = isRksEligible(flat);

  el.innerHTML = `
    <div class="editorHeader">
      ${jacketHtml({ song: song.name, jacket: song.jacket }, 72)}
      <div class="editorTitle">
        <div class="editorName">${escapeHtml(song.name)}</div>
        ${song.wikiUrl
          ? `<a class="editorLink" href="${escapeAttr(song.wikiUrl)}" target="_blank" rel="noopener">View on Wiki ↗</a>`
          : ""}
        <button type="button" id="editSongBtn" class="secondary small" style="margin-left:${song.wikiUrl ? "10px" : "0"};margin-top:4px">Edit song</button>
      </div>
    </div>
    <div class="editorDiffs" id="editorDiffs">
      ${song.charts.map(c => `
        <button type="button" class="diffPick diff-${escapeAttr(c.diff)}${c.diff === chart.diff ? " active" : ""}"
                data-diff="${escapeAttr(c.diff)}">
          ${escapeHtml(c.diff)}${SPECIAL_DIFFS.includes(c.diff) ? "" : ` <span>${c.constant.toFixed(1)}</span>`}
        </button>`).join("")}
    </div>
    <div class="editorAcc">
      <label for="accInput">Accuracy (%)</label>
      <input id="accInput" type="number" min="0" max="100" step="0.01"
             placeholder="e.g. 97.32" value="${acc == null ? "" : acc}"
             ${eligible ? "" : "disabled"}>
      <button type="button" id="accClear" class="secondary" ${acc == null ? "disabled" : ""}>Clear</button>
    </div>
    <div class="editorResult" id="editorResult">
      ${eligible
        ? `Single RKS: <strong>${singleRks(flat).toFixed(4)}</strong>${isPhi(flat) ? " · Phi" : ""}`
        : `<span class="muted">${escapeHtml(chart.diff)} charts aren't used for RKS.</span>`}
    </div>
  `;

  el.querySelectorAll(".diffPick").forEach(btn => {
    btn.addEventListener("click", () => select(song.name, btn.dataset.diff));
  });

  const editBtn = $("editSongBtn");
  if (editBtn) editBtn.addEventListener("click", () => openSongModal(song.name));

  const input = $("accInput");
  if (input) {
    input.addEventListener("input", () => {
      const raw = input.value.trim();
      if (raw === "") {
        delete scores[key];
      } else {
        const value = Math.max(0, Math.min(100, Number(raw)));
        if (Number.isFinite(value)) scores[key] = value;
      }
      saveScores();

      // Update everything the new ACC affects *except* the editor panel
      // itself — re-rendering it would recreate this <input> and steal
      // focus after every keystroke, making it impossible to type more
      // than one digit at a time.
      const clearBtnEl = $("accClear");
      if (clearBtnEl) clearBtnEl.disabled = scores[key] == null;
      const resultEl = $("editorResult");
      if (resultEl) {
        resultEl.innerHTML = eligible
          ? `Single RKS: <strong>${singleRks(flat).toFixed(4)}</strong>${isPhi(flat) ? " · Phi" : ""}`
          : `<span class="muted">${escapeHtml(chart.diff)} charts aren't used for RKS.</span>`;
      }

      renderSongs();
      const r = renderTop();
      renderMiddle(r);
    });
  }

  const clearBtn = $("accClear");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      delete scores[key];
      saveScores();
      renderBottom();
      renderSongs();
      renderAll();
    });
  }
}

// ---------------------------------------------------------------------------
// Left: filterable/sortable/searchable song list
// ---------------------------------------------------------------------------

function filteredCharts() {
  const search = ui.searchText.toLowerCase();

  let arr = charts.filter(c => {
    const matchesText = !search || c.song.toLowerCase().includes(search);
    const matchesDiff = ui.diffFilters.includes(c.diff);
    return matchesText && matchesDiff;
  });

  if (ui.sortMode === "difficulty") {
    arr.sort((a, b) => b.constant - a.constant || a.song.localeCompare(b.song));
  } else if (ui.sortMode === "acc") {
    arr.sort((a, b) => (scores[chartKey(b)] ?? -1) - (scores[chartKey(a)] ?? -1));
  } else if (ui.sortMode === "rks") {
    arr.sort((a, b) => singleRks(b) - singleRks(a));
  } else {
    arr.sort((a, b) => a.song.localeCompare(b.song) || a.diff.localeCompare(b.diff));
  }

  return arr;
}

function diffSortIndex(d) {
  const i = ALL_DIFFS.indexOf(d);
  return i === -1 ? ALL_DIFFS.length : i;
}

// Groups the filtered charts by song, so the left panel shows one entry per
// song with its matching difficulties attached as tags. Sort order is based
// on an aggregate (best/max) value across each song's matched charts, so
// "difficulty"/"acc"/"rks" sort modes still make sense at the song level.
function filteredSongGroups() {
  const matched = filteredCharts();

  const bySong = new Map();
  for (const c of matched) {
    if (!bySong.has(c.song)) bySong.set(c.song, []);
    bySong.get(c.song).push(c);
  }

  const groups = [...bySong.entries()].map(([song, list]) => ({
    song,
    charts: [...list].sort((a, b) => diffSortIndex(a.diff) - diffSortIndex(b.diff)),
  }));

  if (ui.sortMode === "difficulty") {
    groups.sort((a, b) =>
      Math.max(...b.charts.map(c => c.constant)) - Math.max(...a.charts.map(c => c.constant)) ||
      a.song.localeCompare(b.song)
    );
  } else if (ui.sortMode === "acc") {
    const bestAcc = g => Math.max(...g.charts.map(c => scores[chartKey(c)] ?? -1));
    groups.sort((a, b) => bestAcc(b) - bestAcc(a) || a.song.localeCompare(b.song));
  } else if (ui.sortMode === "rks") {
    const bestRks = g => Math.max(...g.charts.map(c => singleRks(c)));
    groups.sort((a, b) => bestRks(b) - bestRks(a) || a.song.localeCompare(b.song));
  } else {
    groups.sort((a, b) => a.song.localeCompare(b.song));
  }

  return groups;
}

function renderSongs() {
  const groups = filteredSongGroups();
  const jacketHeight = SONG_JACKET_HEIGHT;
  const frag = document.createDocumentFragment();

  if (!groups.length) {
    $("songs").innerHTML = charts.length
      ? `<div class="empty">No songs match this search/filter.</div>`
      : `<div class="empty">No songs yet. Click <strong>+ Add song</strong> above to enter your first chart.</div>`;
    $("songs").className = "songList empty";
    return;
  }
  $("songs").className = "songList";

  for (const g of groups) {
    const tagCharts = g.charts;
    // Only show a single difficulty's full detail (badge + constant, acc,
    // single RKS) when the song has exactly one matched tag and it isn't a
    // special (SP/Legacy) chart. Otherwise just show the difficulty tags.
    const singleTagCase = tagCharts.length === 1 && !SPECIAL_DIFFS.includes(tagCharts[0].diff);
    const anyEligible = tagCharts.some(isRksEligible);
    const isSongSelected = selected.song === g.song;
    const defaultDiff = (tagCharts.find(c => c.diff === "IN") || tagCharts[0]).diff;

    const row = document.createElement("div");
    row.className = "song groupRow" + (!anyEligible ? " nonRks" : "") + (isSongSelected ? " selected" : "");

    let topTagsHtml = "";
    let overlayHtml = "";
    if (singleTagCase) {
      const c = tagCharts[0];
      const acc = scores[chartKey(c)];
      const rks = singleRks(c);
      topTagsHtml = `<span class="diffBadge diff-${escapeAttr(c.diff)}">${escapeHtml(c.diff)} ${c.constant.toFixed(1)}</span>`;
      overlayHtml = `
        ${acc == null ? "" : `<span class="jacketBadge jacketBadgeAcc">${acc.toFixed(2)}%</span>`}
        <span class="jacketBadge jacketBadgeRks">${acc == null || !isRksEligible(c) ? "—" : Math.round(rks)}</span>
      `;
    } else {
      topTagsHtml = tagCharts.map(c => `
        <button type="button" class="diffTagBtn diff-${escapeAttr(c.diff)}${isSongSelected && selected.diff === c.diff ? " active" : ""}" data-diff="${escapeAttr(c.diff)}">${escapeHtml(c.diff)}</button>
      `).join("");
    }

    row.innerHTML = `
      <div class="songTop">
        <div class="songTitle" title="${escapeAttr(g.song)}">${escapeHtml(g.song)}</div>
        <div class="songTopTags">${topTagsHtml}</div>
      </div>
      <div class="songJacketWrap" style="height:${jacketHeight}px">
        ${jacketHtml(tagCharts[0], null, true)}
        ${overlayHtml}
      </div>
    `;

    row.addEventListener("click", () => select(g.song, defaultDiff));
    row.querySelectorAll(".diffTagBtn").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        select(g.song, btn.dataset.diff);
      });
    });

    frag.appendChild(row);
  }

  $("songs").replaceChildren(frag);
}

// ---------------------------------------------------------------------------
// UI controls: search, diff chips, sort, card size, resizer
// ---------------------------------------------------------------------------

function renderDiffChips() {
  $("diffChips").innerHTML = ALL_DIFFS.map(d => `
    <button type="button" class="chip diff-${d}${ui.diffFilters.includes(d) ? " active" : ""}" data-diff="${d}">${d}</button>
  `).join("");

  $("diffChips").querySelectorAll(".chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const d = chip.dataset.diff;
      if (ui.diffFilters.includes(d)) {
        if (ui.diffFilters.length > 1) ui.diffFilters = ui.diffFilters.filter(x => x !== d);
      } else {
        ui.diffFilters = [...ui.diffFilters, d];
      }
      saveUi();
      renderDiffChips();
      renderSongs();
    });
  });
}

function applyLeftWidth() {
  $("leftPanel").style.width = `${ui.leftWidth}px`;
}

function setupResizer() {
  const resizer = $("resizer");
  const layout = $("appLayout");
  let dragging = false;

  resizer.addEventListener("pointerdown", e => {
    dragging = true;
    resizer.setPointerCapture(e.pointerId);
  });

  resizer.addEventListener("pointermove", e => {
    if (!dragging) return;
    const rect = layout.getBoundingClientRect();
    const width = Math.max(260, Math.min(640, e.clientX - rect.left));
    ui.leftWidth = Math.round(width);
    applyLeftWidth();
  });

  const stop = () => {
    if (!dragging) return;
    dragging = false;
    saveUi();
  };
  resizer.addEventListener("pointerup", stop);
  resizer.addEventListener("pointercancel", stop);
}

function setupControls() {
  $("search").value = ui.searchText;
  $("search").addEventListener("input", e => {
    ui.searchText = e.target.value;
    saveUi();
    renderSongs();
  });

  $("sort").value = ui.sortMode;
  $("sort").addEventListener("change", e => {
    ui.sortMode = e.target.value;
    saveUi();
    renderSongs();
  });

  $("exportBtn").addEventListener("click", exportScores);
  $("importInput").addEventListener("change", e => {
    if (e.target.files[0]) importScores(e.target.files[0]);
  });
  $("clearBtn").addEventListener("click", () => {
    if (!confirm("Clear every saved ACC from this browser?")) return;
    scores = {};
    saveScores();
    renderAll();
  });
}

// ---------------------------------------------------------------------------
// Import / export (unchanged behaviour)
// ---------------------------------------------------------------------------

function exportScores() {
  const blob = new Blob([JSON.stringify(scores, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "phigros-rks-scores.json";
  a.click();
  URL.revokeObjectURL(url);
}

function importScores(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!imported || typeof imported !== "object" || Array.isArray(imported)) {
        throw new Error("Invalid score file");
      }
      scores = {};
      for (const [k, v] of Object.entries(imported)) {
        const n = Number(v);
        if (Number.isFinite(n) && n >= 0 && n <= 100) scores[k] = n;
      }
      saveScores();
      renderAll();
    } catch {
      alert("That file is not a valid Phigros RKS score export.");
    }
  };
  reader.readAsText(file);
}

// ---------------------------------------------------------------------------
// Song data (all entries are added manually — see the modal below)
// ---------------------------------------------------------------------------

function flatten(songList) {
  const out = [];
  for (const s of songList) {
    for (const c of s.charts) {
      out.push({
        song: s.name,
        diff: c.diff,
        constant: c.constant,
        jacket: s.jacket,
        wikiUrl: s.wikiUrl,
      });
    }
  }
  return out;
}

function renderAll() {
  renderSongs();
  const r = renderTop();
  renderMiddle(r);
  renderBottom();
}

// ---------------------------------------------------------------------------
// Manual song entry: add/edit modal, deterministic Phigros Wiki URL, and
// jacket art either fetched from that Wiki page or uploaded from disk
// ---------------------------------------------------------------------------

let jacketMode = "wiki";     // "wiki" | "link" | "upload" — which jacket panel is active
let pendingJacket = null;    // the jacket value about to be saved (image URL or data: URL)
let pendingWikiUrl = null;   // the wiki page URL about to be saved
let selectedSpecialCharts = [];

// Phigros Wiki page URLs follow a fixed pattern: spaces become underscores.
// e.g. "ENERGY SYNERGY MATRIX" -> https://phigros.fandom.com/wiki/ENERGY_SYNERGY_MATRIX
function computeWikiUrl(name) {
  const trimmed = (name || "").trim();
  if (!trimmed) return null;
  return `${WIKI_BASE}/wiki/${encodeURIComponent(trimmed.replace(/\s+/g, "_"))}`;
}

// Reads the page image off that exact Wiki URL via the Fandom MediaWiki API
// (CORS-enabled via origin=*). Throws with a user-facing message on failure.
async function fetchJacketFromWiki(name) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Enter a song name first.");
  const title = trimmed.replace(/\s+/g, "_");

  const infoUrl =
    `${WIKI_BASE}/api.php?action=query&titles=${encodeURIComponent(title)}` +
    `&prop=pageimages|info&piprop=original&inprop=url&redirects=1&format=json&origin=*`;
  console.log("[jacket debug] request:", infoUrl);

  const infoRes = await fetch(infoUrl);
  if (!infoRes.ok) throw new Error(`Wiki lookup failed (HTTP ${infoRes.status}).`);
  const infoData = await infoRes.json();
  console.log("[jacket debug] response:", infoData);

  const page = Object.values(infoData?.query?.pages || {})[0];
  if (!page || page.missing !== undefined) {
    throw new Error(`No Wiki page found at /wiki/${title} — check the spelling/capitalization.`);
  }

  const jacket = page.original?.source || null;
  const wikiUrl = page.fullurl || computeWikiUrl(trimmed);
  console.log("[jacket debug] image link:", jacket);

  return { jacket, wikiUrl };
}

// Maps the Wiki's human-readable difficulty names (used as column headers in
// the "Difficulty" row of the infobox table) to this app's difficulty codes.
const WIKI_DIFF_NAMES = {
  easy: "EZ",
  hard: "HD",
  insane: "IN",
  another: "AT",
};

// The Phigros Wiki's infobox is template-generated ({{SongAuto|...}}), so the
// numbers don't exist as plain wikitext parameters on the page — they only
// appear in the rendered table. Its shape is a header row starting with
// "Difficulty" (followed by cells named Easy/Hard/Insane/Another — as many as
// the song has, since most songs have no AT chart), immediately followed by a
// "Level" row whose cells are the constants, lined up column-for-column with
// the header row above it. e.g.:
//   Difficulty | Easy | Hard | Insane | Another
//   Level      |  7   | 12.7 | 16.1   | 17.6
// Fetches the song's Wiki page and reads off its EZ/HD/IN/AT difficulty
// constants. On Phigros Wiki a chart's "difficulty" *is* its difficulty
// constant (e.g. IN 16.1) — there's no separate number to look up.
async function fetchConstantsFromWiki(name) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Enter a song name first.");
  const title = trimmed.replace(/\s+/g, "_");

  const htmlUrl =
    `${WIKI_BASE}/api.php?action=parse&page=${encodeURIComponent(title)}` +
    `&prop=text&redirects=1&format=json&origin=*`;
  console.log("[const debug] request:", htmlUrl);

  const res = await fetch(htmlUrl);
  if (!res.ok) throw new Error(`Wiki lookup failed (HTTP ${res.status}).`);
  const data = await res.json();
  console.log("[const debug] response:", data);

  if (data.error || !data.parse) {
    throw new Error(`No Wiki page found at /wiki/${title} — check the spelling/capitalization.`);
  }

  const html = data.parse.text?.["*"] || "";
  const result = parseConstantsFromInfoboxHtml(html);

  if (!Object.keys(result).length) {
    throw new Error("Could not find difficulty constants on this Wiki page — enter them manually.");
  }
  return result;
}

function parseConstantsFromInfoboxHtml(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const rows = [...doc.querySelectorAll("tr")];
  const result = {};

  for (let r = 0; r < rows.length; r++) {
    const headerCells = [...rows[r].children];
    if (!headerCells.length) continue;
    if (headerCells[0].textContent.trim().toLowerCase() !== "difficulty") continue;

    const diffCodes = headerCells.slice(1).map(c => WIKI_DIFF_NAMES[c.textContent.trim().toLowerCase()] || null);

    const valueRow = rows[r + 1];
    const valueCells = valueRow ? [...valueRow.children] : [];
    if (valueCells[0]?.textContent.trim().toLowerCase() !== "level") continue;

    const values = valueCells.slice(1);
    diffCodes.forEach((diff, i) => {
      if (!diff) return; // an unrecognized/blank column (e.g. a song with no AT chart)
      const raw = values[i]?.textContent.trim();
      if (raw && /^\d+(?:\.\d+)?$/.test(raw)) result[diff] = Number(raw);
    });

    break; // a song page has exactly one such table
  }

  return result;
}

function renderConstGrid() {
  $("constGrid").innerHTML = ELIGIBLE_DIFFS.map(d => `
    <div class="constField diff-${d}">
      <label>${d}</label>
      <input type="number" min="0.1" max="20" step="0.1" data-diff="${d}" placeholder="—">
    </div>
  `).join("");
}

function updateJacketPreview(url, name) {
  const el = $("jacketPreview");
  el.dataset.initials = initials(name || "?");
  el.innerHTML = url
    ? `<img src="${escapeAttr(url)}" alt="" referrerpolicy="no-referrer"
         onerror="console.error('[jacket debug] failed to load image:', this.src); this.style.display='none'">`
    : "";
}

function updateWikiUrlPreview() {
  const url = computeWikiUrl($("fName").value);
  $("wikiUrlPreview").textContent = url
    ? url.replace(/^https?:\/\//, "")
    : "Enter a song name to see the Wiki URL.";
}

function syncSpecialChartToggles() {
  $("specialChartToggle")?.querySelectorAll(".specialChartBtn").forEach(btn => {
    const diff = btn.dataset.special;
    btn.classList.toggle("active", selectedSpecialCharts.includes(diff));
  });
}

function toggleSpecialChart(diff) {
  if (selectedSpecialCharts.includes(diff)) {
    selectedSpecialCharts = selectedSpecialCharts.filter(d => d !== diff);
  } else {
    selectedSpecialCharts = [...selectedSpecialCharts, diff];
  }
  syncSpecialChartToggles();
}

function setJacketMode(mode) {
  jacketMode = mode;
  $("jacketModeToggle").querySelectorAll(".jacketModeBtn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });
  $("jacketWikiPanel").classList.toggle("hidden", mode !== "wiki");
  $("jacketLinkPanel").classList.toggle("hidden", mode !== "link");
  $("jacketUploadPanel").classList.toggle("hidden", mode !== "upload");
}

// Guesses which jacket-source panel a saved jacket value came from, so
// reopening a song's editor starts on the right tab: an uploaded image is
// always a data: URL, a Wiki-fetched jacket comes off Fandom's image CDN,
// and anything else is a plain pasted link.
function guessJacketMode(jacket) {
  if (!jacket) return "wiki";
  if (jacket.startsWith("data:")) return "upload";
  if (/fandom\.com|wikia\.nocookie\.net/i.test(jacket)) return "wiki";
  return "link";
}

function openSongModal(name = null) {
  editingSongName = name;
  const song = name ? songs.find(s => s.name === name) : null;

  $("addSongTitle").textContent = song ? "Edit song" : "Add a song";
  $("fName").value = song?.name || "";
  $("fName").disabled = !!song; // renaming would orphan saved ACCs, so lock it on edit

  pendingJacket = song?.jacket || null;
  pendingWikiUrl = song?.wikiUrl || computeWikiUrl(song?.name || "");
  $("jacketStatus").textContent = "";
  $("jacketLinkStatus").textContent = "";
  $("fJacketFile").value = "";
  const initialJacketMode = guessJacketMode(pendingJacket);
  $("fJacketLink").value = initialJacketMode === "link" ? pendingJacket : "";
  updateWikiUrlPreview();
  updateJacketPreview(pendingJacket, song?.name || "");
  setJacketMode(initialJacketMode);

  $("constGrid").querySelectorAll("input").forEach(input => {
    const existing = song?.charts.find(c => c.diff === input.dataset.diff);
    input.value = existing ? existing.constant : "";
  });
  if ($("constStatus")) $("constStatus").textContent = "";

  const specialCharts = (song?.charts || []).filter(c => SPECIAL_DIFFS.includes(c.diff)).map(c => c.diff);
  selectedSpecialCharts = [...new Set(specialCharts)];
  syncSpecialChartToggles();

  $("addSongDelete").classList.toggle("hidden", !song);
  $("addSongModal").classList.remove("hidden");
  $("fName").focus();
}

function closeSongModal() {
  $("addSongModal").classList.add("hidden");
  editingSongName = null;
}

function setupAddSongModal() {
  renderConstGrid();

  $("addSongBtn").addEventListener("click", () => openSongModal(null));
  $("addSongClose").addEventListener("click", closeSongModal);
  $("addSongCancel").addEventListener("click", closeSongModal);
  $("addSongModal").addEventListener("click", e => {
    if (e.target.id === "addSongModal") closeSongModal();
  });

  $("jacketModeToggle").querySelectorAll(".jacketModeBtn").forEach(btn => {
    btn.addEventListener("click", () => setJacketMode(btn.dataset.mode));
  });

  $("specialChartToggle")?.querySelectorAll(".specialChartBtn").forEach(btn => {
    btn.addEventListener("click", () => toggleSpecialChart(btn.dataset.special));
  });

  $("fetchConstBtn")?.addEventListener("click", async () => {
    const btn = $("fetchConstBtn");
    const status = $("constStatus");
    const name = $("fName").value.trim();
    if (!name) { status.textContent = "Enter a song name first."; return; }

    btn.disabled = true;
    status.textContent = "Fetching difficulty constants from Phigros Wiki…";
    try {
      const result = await fetchConstantsFromWiki(name);
      let filled = 0;
      $("constGrid").querySelectorAll("input").forEach(input => {
        const value = result[input.dataset.diff];
        if (value != null) {
          input.value = value;
          filled++;
        }
      });
      status.textContent = filled
        ? `Filled in ${filled} difficult${filled === 1 ? "y" : "ies"} — double-check these against the Wiki page.`
        : "Page found, but no difficulty constants were recognized. Enter them manually.";
    } catch (err) {
      status.textContent = err.message || "Could not fetch from the Wiki.";
    } finally {
      btn.disabled = false;
    }
  });

  $("fName").addEventListener("input", () => {
    updateWikiUrlPreview();
    if (jacketMode === "wiki") updateJacketPreview(pendingJacket, $("fName").value);
  });

  $("fetchJacketBtn").addEventListener("click", async () => {
    const btn = $("fetchJacketBtn");
    const status = $("jacketStatus");
    const name = $("fName").value.trim();
    if (!name) { status.textContent = "Enter a song name first."; return; }

    btn.disabled = true;
    status.textContent = "Fetching from Phigros Wiki…";
    try {
      const result = await fetchJacketFromWiki(name);
      pendingWikiUrl = result.wikiUrl;
      if (result.jacket) {
        pendingJacket = result.jacket;
        updateJacketPreview(pendingJacket, name);
        status.textContent = `Jacket found: ${result.jacket}`;
      } else {
        status.textContent = "Page found, but it has no image on it.";
      }
    } catch (err) {
      status.textContent = err.message || "Could not fetch from the Wiki.";
    } finally {
      btn.disabled = false;
    }
  });

  $("fJacketLink").addEventListener("input", () => {
    const url = $("fJacketLink").value.trim();
    pendingJacket = url || null;
    updateJacketPreview(pendingJacket, $("fName").value);
    $("jacketLinkStatus").textContent = url ? "" : "Paste a direct link to an image.";
  });

  $("fJacketFile").addEventListener("change", () => {
    const file = $("fJacketFile").files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      pendingJacket = reader.result;
      updateJacketPreview(pendingJacket, $("fName").value);
    };
    reader.readAsDataURL(file);
  });

  $("addSongForm").addEventListener("submit", e => {
    e.preventDefault();

    const name = $("fName").value.trim();
    if (!name) return;

    let chartsList = [];

    $("constGrid").querySelectorAll("input").forEach(input => {
      const raw = input.value.trim();
      if (raw === "") return;
      const value = Number(raw);
      if (Number.isFinite(value) && value > 0) {
        chartsList.push({ diff: input.dataset.diff, constant: value });
      }
    });

    selectedSpecialCharts.forEach(diff => {
      chartsList.push({ diff, constant: 0 });
    });

    if (!chartsList.length) {
      alert("Enter at least one difficulty constant or add an SP/Legacy toggle.");
      return;
    }

    if (!editingSongName && songs.some(s => s.name.toLowerCase() === name.toLowerCase())) {
      alert("A song with this name already exists.");
      return;
    }

    const songData = {
      name,
      jacket: pendingJacket || null,
      wikiUrl: pendingWikiUrl || computeWikiUrl(name),
      charts: chartsList,
    };

    if (editingSongName) {
      const idx = songs.findIndex(s => s.name === editingSongName);
      if (idx !== -1) songs[idx] = songData;
    } else {
      songs.push(songData);
    }

    saveSongs();
    rebuildCharts();
    closeSongModal();
    select(name, chartsList[0].diff);
  });

  $("addSongDelete").addEventListener("click", () => {
    if (!editingSongName) return;
    if (!confirm(`Delete "${editingSongName}"? This also removes its saved ACCs.`)) return;

    const removedName = editingSongName;
    songs = songs.filter(s => s.name !== removedName);
    for (const key of Object.keys(scores)) {
      if (key.startsWith(`${removedName}\u0000`)) delete scores[key];
    }

    saveScores();
    saveSongs();
    rebuildCharts();
    if (selected.song === removedName) { selected.song = null; selected.diff = null; }
    closeSongModal();
    renderAll();
  });
}

// ---------------------------------------------------------------------------
// Escaping helpers
// ---------------------------------------------------------------------------

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
}

function escapeAttr(s) {
  return escapeHtml(s);
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

loadScores();
loadUi();
loadSongs();
applyLeftWidth();
renderDiffChips();
setupControls();
setupResizer();
setupAddSongModal();
renderAll();