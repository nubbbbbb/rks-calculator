const SCORE_KEY = "phigros-rks-scores-v2";
const UI_KEY = "phigros-rks-ui-v1";

const ELIGIBLE_DIFFS = ["EZ", "HD", "IN", "AT"];
const ALL_DIFFS = ["EZ", "HD", "IN", "AT"];
const SONG_JACKET_HEIGHT = 90; // left-panel song cards always use the compact size

const DEFAULT_UI = {
  leftWidth: 380,
  diffFilters: ["EZ", "HD", "IN", "AT"],
  sortMode: "song",
  sortDirection: "increasing",
  sidebarFormat: "compact",
  searchText: "",
};

const chartLibrary = window.PHIGROS_CHART_LIBRARY;
if (!chartLibrary || !Array.isArray(chartLibrary.songs) || !chartLibrary.songs.length) {
  throw new Error("The checked-in Phigros chart library could not be loaded.");
}

const songs = chartLibrary.songs;
const songsById = new Map(songs.map(song => [song.id, song]));
let charts = [];  // flattened: [{song, songId, scoreKey, diff, constant}]
let scores = {};
let calculationCache = null;
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
  calculationCache = null;
}

function saveScores() {
  localStorage.setItem(SCORE_KEY, JSON.stringify(scores));
}

function loadUi() {
  try {
    const stored = JSON.parse(localStorage.getItem(UI_KEY) || "{}");
    ui = { ...DEFAULT_UI, ...stored };
    if (!Array.isArray(ui.diffFilters)) {
      ui.diffFilters = [...DEFAULT_UI.diffFilters];
    } else {
      ui.diffFilters = ui.diffFilters.filter(diff => ALL_DIFFS.includes(diff));
      if (!ui.diffFilters.length) ui.diffFilters = [...DEFAULT_UI.diffFilters];
    }
  } catch {
    ui = { ...DEFAULT_UI };
  }
}

function saveUi() {
  localStorage.setItem(UI_KEY, JSON.stringify(ui));
}

function loadChartLibrary() {
  charts = flatten(songs);
  $("dataStatus").textContent =
    `${songs.length} songs · ${charts.length} charts · phigros.tools game v${chartLibrary.gameVersion}`;
}

// ---------------------------------------------------------------------------
// RKS math (unchanged formula, now driven off the flattened chart list)
// ---------------------------------------------------------------------------

function chartKey(c) {
  return `${c.scoreKey}\u0000${c.diff}`;
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

function invalidateCalculation() {
  calculationCache = null;
}

function calculate() {
  if (calculationCache) return calculationCache;

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

  calculationCache = {
    played, b27, p3, b27Sum, p3Sum, contributing,
    rks: (b27Sum + p3Sum) / 30,
  };
  return calculationCache;
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
  // The cover images are hosted by phigros.tools and aren't copied into this repo.
  const img = c.jacket
    ? `<img src="${escapeAttr(c.jacket)}" alt="" loading="lazy" referrerpolicy="no-referrer"
         onerror="this.style.display='none'">`
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

  $("rksValue").textContent = r.rks.toFixed(3);
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
    const isSelected = selected.song === c.songId && selected.diff === c.diff;
    return `
      <button type="button" class="contribCard${isSelected ? " selected" : ""}" data-song="${escapeAttr(c.songId)}" data-diff="${escapeAttr(c.diff)}">
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

}

// ---------------------------------------------------------------------------
// Bottom: selected-song editor
// ---------------------------------------------------------------------------

function select(songId, diff) {
  const song = songsById.get(songId);
  if (!song) return;

  selected.song = songId;
  // Keep the requested diff if that chart exists, otherwise fall back to
  // the first available chart on this song.
  selected.diff = song.charts.some(c => c.diff === diff) ? diff : song.charts[0]?.diff ?? null;

  renderBottom();
  updateSelectionStyles();
}

function updateSelectionStyles() {
  $("songs").querySelectorAll(".groupRow").forEach(row => {
    const isSelected = row.dataset.songId === selected.song;
    row.classList.toggle("selected", isSelected);
    row.querySelectorAll(".normalDiffRow, .diffTagBtn").forEach(button => {
      button.classList.toggle(
        "active",
        isSelected && button.dataset.diff === selected.diff
      );
    });
  });

  $("contribGrid").querySelectorAll(".contribCard").forEach(card => {
    card.classList.toggle(
      "selected",
      card.dataset.song === selected.song && card.dataset.diff === selected.diff
    );
  });
}

function getRequiredAccForChart(chart, currentAcc = null) {
  if (!isRksEligible(chart)) return null;

  const r = calculate();
  const b27Cutoff = r.b27.length ? Math.min(...r.b27.map(c => singleRks(c))) : 0;
  if (chart.constant <= b27Cutoff) {
    const p3Cutoff = r.p3.length ? Math.min(...r.p3.map(c => c.constant)) : null;
    return p3Cutoff != null && chart.constant > p3Cutoff
      ? { tooEasy: false, value: 100 }
      : { tooEasy: true };
  }

  const computedRequired = 55 + 45 * Math.sqrt(b27Cutoff / chart.constant);
  const chartCurrentAcc = Number.isFinite(Number(currentAcc)) ? Number(currentAcc) : null;
  const required = chartCurrentAcc == null ? computedRequired : Math.max(chartCurrentAcc, computedRequired);
  return { tooEasy: false, value: required };
}

function renderBottom() {
  const el = $("bottomDiv");
  const song = songsById.get(selected.song);

  if (!song) {
    el.innerHTML = `<div class="empty">Select a song from the list on the left to edit its accuracy.</div>`;
    return;
  }

  const chart = song.charts.find(c => c.diff === selected.diff) || song.charts[0];
  const flat = { scoreKey: song.scoreKey, diff: chart.diff, constant: chart.constant };
  const key = chartKey(flat);
  const acc = scores[key];
  const eligible = isRksEligible(flat);
  const requiredAcc = eligible ? getRequiredAccForChart(flat, acc) : null;

  el.innerHTML = `
    <div class="editorHeader">
      ${jacketHtml({ song: song.label, jacket: song.jacket }, 72)}
      <div class="editorTitle">
        <div class="editorName">${escapeHtml(song.label)}</div>
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
    <div class="editorResult" id="editorResult">
      ${requiredAcc && !requiredAcc.tooEasy
        ? `<div>Required Acc: <strong>${requiredAcc.value.toFixed(2)}%</strong></div>`
        : requiredAcc?.tooEasy
          ? `<div>Required Acc: This chart is too easy to gain RKS</div>`
          : ""}
      ${eligible
        ? `<div>Single RKS: <strong>${singleRks(flat).toFixed(4)}</strong>${isPhi(flat) ? " · Phi" : ""}</div>`
        : `<span class="muted">${escapeHtml(chart.diff)} charts aren't used for RKS.</span>`}
    </div>
  `;

  el.querySelectorAll(".diffPick").forEach(btn => {
    btn.addEventListener("click", () => select(song.id, btn.dataset.diff));
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
      invalidateCalculation();
      saveScores();

      // Update everything the new ACC affects *except* the editor panel
      // itself — re-rendering it would recreate this <input> and steal
      // focus after every keystroke, making it impossible to type more
      // than one digit at a time.
      const clearBtnEl = $("accClear");
      if (clearBtnEl) clearBtnEl.disabled = scores[key] == null;
      const resultEl = $("editorResult");
      if (resultEl) {
        const requiredAcc = eligible ? getRequiredAccForChart(flat, scores[key]) : null;
        resultEl.innerHTML = `
          ${requiredAcc && !requiredAcc.tooEasy
            ? `<div>Required Acc: <strong>${requiredAcc.value.toFixed(2)}%</strong></div>`
            : requiredAcc?.tooEasy
              ? `<div>Required Acc: This chart is too easy to gain RKS</div>`
              : ""}
          ${eligible
            ? `<div>Single RKS: <strong>${singleRks(flat).toFixed(4)}</strong>${isPhi(flat) ? " · Phi" : ""}</div>`
            : `<span class="muted">${escapeHtml(chart.diff)} charts aren't used for RKS.</span>`}
        `;
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
      invalidateCalculation();
      saveScores();
      renderAll();
    });
  }
}

// ---------------------------------------------------------------------------
// Left: filterable/sortable/searchable song list
// ---------------------------------------------------------------------------

function filteredCharts() {
  const search = ui.searchText.toLowerCase();
  const direction = ui.sortDirection === "decreasing" ? -1 : 1;

  const compareText = (a, b) => (a < b ? -1 : a > b ? 1 : 0) * direction;
  const compareNumber = (a, b) => (a - b) * direction;

  let arr = charts.filter(c => {
    const matchesText = !search || c.song.toLowerCase().includes(search);
    const matchesDiff = ui.diffFilters.includes(c.diff);
    return matchesText && matchesDiff;
  });

  if (ui.sortMode === "difficulty") {
    arr.sort((a, b) => compareNumber(a.constant, b.constant) || compareText(a.song, b.song));
  } else if (ui.sortMode === "acc") {
    arr.sort((a, b) => compareNumber(scores[chartKey(a)] ?? -1, scores[chartKey(b)] ?? -1));
  } else if (ui.sortMode === "rks") {
    arr.sort((a, b) => compareNumber(singleRks(a), singleRks(b)));
  } else {
    arr.sort((a, b) => compareText(a.song, b.song) || compareText(a.diff, b.diff));
  }

  return arr;
}

function diffSortIndex(d) {
  const i = ALL_DIFFS.indexOf(d);
  return i === -1 ? ALL_DIFFS.length : i;
}

// Groups the filtered charts by song, so the left panel shows one entry per
// song with its matching difficulties attached as tags. Song order follows
// the first matching chart's position in the already sorted chart list.
function filteredSongGroups() {
  const matched = filteredCharts();

  const bySong = new Map();
  const firstPosition = new Map();
  matched.forEach((c, index) => {
    if (!bySong.has(c.songId)) bySong.set(c.songId, []);
    bySong.get(c.songId).push(c);
    if (!firstPosition.has(c.songId)) firstPosition.set(c.songId, index);
  });

  const groups = [...bySong.entries()].map(([songId, list]) => {
    const song = songsById.get(songId);
    return {
      songId,
      name: song.label,
      charts: [...list].sort((a, b) => diffSortIndex(a.diff) - diffSortIndex(b.diff)),
      firstPosition: firstPosition.get(songId),
    };
  });

  groups.sort((a, b) => a.firstPosition - b.firstPosition);

  return groups;
}

function renderSongs() {
  const groups = filteredSongGroups();
  const jacketHeight = SONG_JACKET_HEIGHT;
  const frag = document.createDocumentFragment();

  if (!groups.length) {
    $("songs").innerHTML = charts.length
      ? `<div class="empty">No songs match this search/filter.</div>`
      : `<div class="empty">The chart library is empty.</div>`;
    $("songs").className = "songList empty";
    return;
  }
  $("songs").className = "songList";

  for (const g of groups) {
    const tagCharts = g.charts;
    // Show full chart detail when the song has exactly one matched difficulty.
    const singleTagCase = tagCharts.length === 1;
    const anyEligible = tagCharts.some(isRksEligible);
    const isSongSelected = selected.song === g.songId;
    const defaultDiff = (tagCharts.find(c => c.diff === "IN") || tagCharts[0]).diff;

    const row = document.createElement("div");
    row.className = "song groupRow" + (!anyEligible ? " nonRks" : "") + (isSongSelected ? " selected" : "");
    row.dataset.songId = g.songId;
    row.dataset.defaultDiff = defaultDiff;

    if (ui.sidebarFormat === "normal") {
      row.classList.add("normalSong");
      row.innerHTML = `
        <div class="songTitle" title="${escapeAttr(g.name)}">${escapeHtml(g.name)}</div>
        <div class="songJacketWrap" style="height:${jacketHeight}px">
          ${jacketHtml(tagCharts[0], null, true)}
        </div>
        <div class="normalDiffList">
          ${tagCharts.map(c => `
            ${(() => {
              const acc = scores[chartKey(c)];
              const requiredAcc = getRequiredAccForChart(c, acc);
              const requiredLabel = requiredAcc?.tooEasy
                ? "-"
                : requiredAcc
                  ? `${requiredAcc.value.toFixed(2)}%`
                  : "—";
              const currentAccClass = Number(acc) === 100 ? " perfect" : "";
              const requiredAccClass = requiredAcc && !requiredAcc.tooEasy && requiredAcc.value === 100 ? " perfect" : "";
              return `
            <button type="button" class="normalDiffRow${isSongSelected && selected.diff === c.diff ? " active" : ""}" data-diff="${escapeAttr(c.diff)}">
              <span class="diffBadge diff-${escapeAttr(c.diff)}">${escapeHtml(c.diff)} ${c.constant.toFixed(1)}</span>
              <span class="normalDiffAccuracy"><span class="normalCurrentAcc${currentAccClass}">${acc == null ? "—" : `${Number(acc).toFixed(2)}%`}</span><span class="normalAccuracySlash">/</span><span class="normalRequiredAcc${requiredAccClass}">${requiredLabel}</span></span>
              <span class="normalDiffRks">${!isRksEligible(c) || scores[chartKey(c)] == null ? "—" : singleRks(c).toFixed(3)}</span>
            </button>
          `;
            })()}
          `).join("")}
        </div>
      `;
      frag.appendChild(row);
      continue;
    }

    let topTagsHtml = "";
    let overlayHtml = "";
    if (singleTagCase) {
      const c = tagCharts[0];
      const acc = scores[chartKey(c)];
      const rks = singleRks(c);
      topTagsHtml = `<span class="diffBadge diff-${escapeAttr(c.diff)}">${escapeHtml(c.diff)} ${c.constant.toFixed(1)}</span>`;
      overlayHtml = `
        ${acc == null ? "" : `<span class="jacketBadge jacketBadgeAcc">${acc.toFixed(2)}%</span>`}
        <span class="jacketBadge jacketBadgeRks">${acc == null || !isRksEligible(c) ? "—" : rks.toFixed(3)}</span>
      `;
    } else {
      topTagsHtml = tagCharts.map(c => `
        <button type="button" class="diffTagBtn diff-${escapeAttr(c.diff)}${isSongSelected && selected.diff === c.diff ? " active" : ""}" data-diff="${escapeAttr(c.diff)}">${escapeHtml(c.diff)}</button>
      `).join("");
    }

    row.innerHTML = `
      <div class="songTop">
        <div class="songTitle" title="${escapeAttr(g.name)}">${escapeHtml(g.name)}</div>
        <div class="songTopTags">${topTagsHtml}</div>
      </div>
      <div class="songJacketWrap" style="height:${jacketHeight}px">
        ${jacketHtml(tagCharts[0], null, true)}
        ${overlayHtml}
      </div>
    `;

    frag.appendChild(row);
  }

  $("songs").replaceChildren(frag);
}

// ---------------------------------------------------------------------------
// UI controls: search, diff chips, sort, sidebar format, resizer
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
  $("songs").addEventListener("click", e => {
    const row = e.target.closest(".groupRow");
    if (!row) return;

    const chartButton = e.target.closest(".normalDiffRow, .diffTagBtn");
    if (ui.sidebarFormat === "normal" && !chartButton?.classList.contains("normalDiffRow")) return;
    select(row.dataset.songId, chartButton?.dataset.diff || row.dataset.defaultDiff);
  });

  $("contribGrid").addEventListener("click", e => {
    const card = e.target.closest(".contribCard");
    if (card) select(card.dataset.song, card.dataset.diff);
  });

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

  const sortDirectionButton = $("sortDirection");
  const updateSortDirectionButton = () => {
    const isDecreasing = ui.sortDirection === "decreasing";
    sortDirectionButton.textContent = isDecreasing ? "↑" : "↓";
    sortDirectionButton.setAttribute("aria-label", `${isDecreasing ? "Decreasing" : "Increasing"} sort`);
    sortDirectionButton.title = `${isDecreasing ? "Decreasing" : "Increasing"} sort`;
  };
  updateSortDirectionButton();
  sortDirectionButton.addEventListener("click", () => {
    ui.sortDirection = ui.sortDirection === "decreasing" ? "increasing" : "decreasing";
    saveUi();
    updateSortDirectionButton();
    renderSongs();
  });

  const sidebarFormatToggle = $("sidebarFormat");
  sidebarFormatToggle.checked = ui.sidebarFormat === "compact";
  sidebarFormatToggle.addEventListener("change", e => {
    ui.sidebarFormat = e.target.checked ? "compact" : "normal";
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
    invalidateCalculation();
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
      invalidateCalculation();
      saveScores();
      renderAll();
    } catch {
      alert("That file is not a valid Phigros RKS score export.");
    }
  };
  reader.readAsText(file);
}

// ---------------------------------------------------------------------------
// Flatten the checked-in song catalog for chart-level calculations and views.
// ---------------------------------------------------------------------------

function flatten(songList) {
  const out = [];
  for (const s of songList) {
    for (const c of s.charts) {
      out.push({
        song: s.label,
        songId: s.id,
        scoreKey: s.scoreKey,
        diff: c.diff,
        constant: c.constant,
        jacket: s.jacket,
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
loadChartLibrary();
applyLeftWidth();
renderDiffChips();
setupControls();
setupResizer();
renderAll();