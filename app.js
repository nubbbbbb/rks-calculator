const SCORE_KEY = "phigros-rks-scores-v2";
const UI_KEY = "phigros-rks-ui-v1";
const DATA_URL = "./songs.json";

const ELIGIBLE_DIFFS = ["EZ", "HD", "IN", "AT"];
const ALL_DIFFS = ["EZ", "HD", "IN", "AT", "SP", "Legacy"];
const SIZES = { compact: 40, comfortable: 52, large: 68 };

const DEFAULT_UI = {
  leftWidth: 380,
  cardSize: "comfortable",
  diffFilters: ["EZ", "HD", "IN", "AT"],
  sortMode: "song",
  searchText: "",
};

let songs = [];   // grouped: [{name, chapter, wikiUrl, jacket, charts:[{diff,constant}]}]
let charts = [];  // flattened: [{song, diff, constant, chapter, jacket, wikiUrl, rksEligible}]
let scores = {};
let ui = { ...DEFAULT_UI };
let selected = { song: null, diff: null };

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

function jacketHtml(c, size) {
  const label = initials(c.song);
  const style = `width:${size}px;height:${size}px`;
  // The song's initials sit behind the <img> as a CSS ::before; if the
  // image is missing or fails to load, hiding it just reveals the initials.
  const img = c.jacket
    ? `<img src="${escapeAttr(c.jacket)}" alt="" loading="lazy" onerror="this.style.display='none'">`
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
  $("scoreCount").textContent = r.played.length;
  $("phiCount").textContent = r.played.filter(isPhi).length;
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
        <div class="editorChapter muted">${escapeHtml(song.chapter || "")}</div>
        <a class="editorLink" href="${escapeAttr(song.wikiUrl)}" target="_blank" rel="noopener">View on Wiki ↗</a>
      </div>
    </div>
    <div class="editorDiffs" id="editorDiffs">
      ${song.charts.map(c => `
        <button type="button" class="diffPick diff-${escapeAttr(c.diff)}${c.diff === chart.diff ? " active" : ""}"
                data-diff="${escapeAttr(c.diff)}">
          ${escapeHtml(c.diff)} <span>${c.constant.toFixed(1)}</span>
        </button>`).join("")}
    </div>
    <div class="editorAcc">
      <label for="accInput">Accuracy (%)</label>
      <input id="accInput" type="number" min="0" max="100" step="0.01"
             placeholder="e.g. 97.32" value="${acc == null ? "" : acc}"
             ${eligible ? "" : "disabled"}>
      <button type="button" id="accClear" class="secondary" ${acc == null ? "disabled" : ""}>Clear</button>
    </div>
    <div class="editorResult">
      ${eligible
        ? `Single RKS: <strong>${singleRks(flat).toFixed(4)}</strong>${isPhi(flat) ? " · Phi" : ""}`
        : `<span class="muted">${escapeHtml(chart.diff)} charts aren't used for RKS.</span>`}
    </div>
  `;

  el.querySelectorAll(".diffPick").forEach(btn => {
    btn.addEventListener("click", () => select(song.name, btn.dataset.diff));
  });

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
      renderBottom();
      renderSongs();
      renderAll();
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

function renderSongs() {
  const list = filteredCharts();
  const size = SIZES[ui.cardSize] ?? SIZES.comfortable;
  const frag = document.createDocumentFragment();

  if (!list.length) {
    $("songs").innerHTML = `<div class="empty">No songs match this search/filter.</div>`;
    $("songs").className = "songList empty";
    return;
  }
  $("songs").className = "songList";

  for (const c of list) {
    const key = chartKey(c);
    const acc = scores[key];
    const rks = singleRks(c);
    const isSelected = selected.song === c.song && selected.diff === c.diff;

    const row = document.createElement("button");
    row.type = "button";
    row.className = "song" + (!isRksEligible(c) ? " nonRks" : "") + (isSelected ? " selected" : "");

    row.innerHTML = `
      ${jacketHtml(c, size)}
      <div class="songName" title="${escapeAttr(c.song)}">
        <div class="songTitle">${escapeHtml(c.song)}</div>
        <div class="songMeta">
          <span class="diffBadge diff-${escapeAttr(c.diff)}">${escapeHtml(c.diff)} ${c.constant.toFixed(1)}</span>
          ${acc == null ? "" : `<span class="accBadge">${acc.toFixed(2)}%</span>`}
        </div>
      </div>
      <div class="singleRks">${acc == null || !isRksEligible(c) ? "—" : Math.round(rks)}</div>
    `;

    row.addEventListener("click", () => select(c.song, c.diff));
    frag.appendChild(row);
  }

  $("songs").replaceChildren(frag);
}

// ---------------------------------------------------------------------------
// UI controls: search, diff chips, sort, card size, resizer
// ---------------------------------------------------------------------------

function renderDiffChips() {
  $("diffChips").innerHTML = ELIGIBLE_DIFFS.map(d => `
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

function renderSizeControl() {
  $("sizeControl").querySelectorAll("button").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.size === ui.cardSize);
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

  $("sizeControl").querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => {
      ui.cardSize = btn.dataset.size;
      saveUi();
      renderSizeControl();
      renderSongs();
    });
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
// Data loading
// ---------------------------------------------------------------------------

function flatten(songList) {
  const out = [];
  for (const s of songList) {
    for (const c of s.charts) {
      out.push({
        song: s.name,
        diff: c.diff,
        constant: c.constant,
        chapter: s.chapter,
        jacket: s.jacket,
        wikiUrl: s.wikiUrl,
      });
    }
  }
  return out;
}

async function loadData() {
  $("dataStatus").textContent = "Loading Wiki song data…";

  try {
    const response = await fetch(DATA_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    songs = Array.isArray(data.songs) ? data.songs : [];
    charts = flatten(songs);

    $("chartCount").textContent = charts.length;
    $("dataStatus").textContent =
      `Wiki snapshot: ${data.sourceVersion || "unknown"} · updated ${data.generatedAt || "unknown"} · ${songs.length} songs`;

    renderAll();
  } catch (err) {
    $("dataStatus").textContent = "Could not load Wiki data.";
    $("songs").innerHTML = `
      <div class="empty">
        Failed to load <code>songs.json</code>.<br>
        ${escapeHtml(String(err))}<br><br>
        If you just cloned the repository, run the Wiki scraper once
        or wait for the GitHub Action to generate the dataset.
      </div>`;
  }
}

function renderAll() {
  renderSongs();
  const r = renderTop();
  renderMiddle(r);
  renderBottom();
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
applyLeftWidth();
renderDiffChips();
renderSizeControl();
setupControls();
setupResizer();
loadData();