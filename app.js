const SCORE_KEY = "phigros-rks-scores-v2";
const DATA_URL = "./songs.json";

let charts = [];
let scores = {};
let searchText = "";
let diffFilter = "ALL";
let sortMode = "song";

const $ = id => document.getElementById(id);

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

function chartKey(c) {
  return `${c.song}\u0000${c.diff}`;
}

function isRksEligible(c) {
  return c.rksEligible !== false;
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
  // RKS only uses regular EZ/HD/IN/AT charts.
  const played = charts.filter(c => isRksEligible(c) && scores[chartKey(c)] != null);

  const b27 = [...played]
    .sort((a, b) => singleRks(b) - singleRks(a))
    .slice(0, 27);

  const p3 = [...played]
    .filter(isPhi)
    .sort((a, b) => b.constant - a.constant)
    .slice(0, 3);

  const b27Sum = b27.reduce((s, c) => s + singleRks(c), 0);
  const p3Sum = p3.reduce((s, c) => s + c.constant, 0);

  return {
    played,
    b27,
    p3,
    b27Sum,
    p3Sum,
    rks: (b27Sum + p3Sum) / 30
  };
}

function renderResults() {
  const r = calculate();

  $("rksValue").textContent = r.rks.toFixed(2);
  $("scoreCount").textContent = r.played.length;
  $("phiCount").textContent = r.played.filter(isPhi).length;
  $("rksDetail").textContent =
    `${r.b27.length}/27 B27 charts + ${r.p3.length}/3 P3 charts`;

  $("b27Sum").textContent = r.b27Sum.toFixed(4);
  $("p3Sum").textContent = r.p3Sum.toFixed(4);

  renderResultList($("b27"), r.b27, false);
  renderResultList($("p3"), r.p3, true);
}

function renderResultList(el, list, phiList) {
  if (!list.length) {
    el.className = "resultList empty";
    el.textContent = phiList ? "No Phi scores yet." : "Not enough scores yet.";
    return;
  }

  el.className = "resultList";
  el.innerHTML = list.map((c, i) => {
    const acc = Number(scores[chartKey(c)]);
    const value = phiList ? c.constant : singleRks(c);

    return `
      <div class="result">
        <div class="rank">${i + 1}</div>
        <div class="resultTitle">
          <div>${escapeHtml(c.song)}</div>
          <div class="resultSmall">${c.diff} · constant ${c.constant.toFixed(1)} · ${acc.toFixed(2)}%</div>
        </div>
        <div class="resultNum">${acc.toFixed(2)}%</div>
        <div class="resultNum">${value.toFixed(4)}</div>
        <div class="resultNum">${phiList ? "P3" : "B27"}</div>
      </div>`;
  }).join("");
}

function filteredCharts() {
  let arr = charts.filter(c => {
    const matchesText =
      !searchText || c.song.toLowerCase().includes(searchText.toLowerCase());
    const matchesDiff = diffFilter === "ALL" || c.diff === diffFilter;
    return matchesText && matchesDiff;
  });

  if (sortMode === "constant") {
    arr.sort((a, b) => b.constant - a.constant || a.song.localeCompare(b.song));
  } else if (sortMode === "acc") {
    arr.sort((a, b) =>
      (scores[chartKey(b)] ?? -1) - (scores[chartKey(a)] ?? -1)
    );
  } else if (sortMode === "rks") {
    arr.sort((a, b) => singleRks(b) - singleRks(a));
  } else {
    arr.sort((a, b) =>
      a.song.localeCompare(b.song) || a.diff.localeCompare(b.diff)
    );
  }

  return arr;
}

function renderSongs() {
  const list = filteredCharts();
  const frag = document.createDocumentFragment();

  for (const c of list) {
    const row = document.createElement("div");
    row.className = "song" + (!isRksEligible(c) ? " nonRks" : "");

    const key = chartKey(c);
    const acc = scores[key];
    const rks = singleRks(c);

    row.innerHTML = `
      <div class="songName" title="${escapeAttr(c.song)}">
        <div class="songTitle">${escapeHtml(c.song)}</div>
        <div class="songMeta">${escapeHtml(c.chapter || "")}${isRksEligible(c) ? "" : " · not used for RKS"}</div>
      </div>
      <div class="diff">${escapeHtml(c.diff)}</div>
      <div class="constant">Lv ${c.constant.toFixed(1)}</div>
      <input class="accInput" type="number" min="0" max="100" step="0.01"
             placeholder="ACC" value="${acc == null ? "" : acc}"
             aria-label="Accuracy for ${escapeAttr(c.song)} ${c.diff}">
      <div class="singleRks">${acc == null || !isRksEligible(c) ? "—" : rks.toFixed(4)}</div>
    `;

    const input = row.querySelector(".accInput");
    input.addEventListener("input", () => {
      const raw = input.value.trim();

      if (raw === "") {
        delete scores[key];
      } else {
        const value = Math.max(0, Math.min(100, Number(raw)));
        if (Number.isFinite(value)) scores[key] = value;
      }

      saveScores();
      renderSongs();
      renderResults();
    });

    frag.appendChild(row);
  }

  $("songs").replaceChildren(frag);
}

async function loadData() {
  $("dataStatus").textContent = "Loading Wiki song data…";

  try {
    const response = await fetch(DATA_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    charts = Array.isArray(data.charts) ? data.charts : [];

    $("chartCount").textContent = charts.length;
    $("dataStatus").textContent =
      `Wiki snapshot: ${data.sourceVersion || "unknown"} · updated ${data.generatedAt || "unknown"}`;

    renderSongs();
    renderResults();
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

function exportScores() {
  const blob = new Blob(
    [JSON.stringify(scores, null, 2)],
    { type: "application/json" }
  );

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
      renderSongs();
      renderResults();
    } catch {
      alert("That file is not a valid Phigros RKS score export.");
    }
  };

  reader.readAsText(file);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[ch]));
}

function escapeAttr(s) {
  return escapeHtml(s);
}

$("search").addEventListener("input", e => {
  searchText = e.target.value;
  renderSongs();
});

$("diffFilter").addEventListener("change", e => {
  diffFilter = e.target.value;
  renderSongs();
});

$("sort").addEventListener("change", e => {
  sortMode = e.target.value;
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
  renderSongs();
  renderResults();
});

loadScores();
loadData();