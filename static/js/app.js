/* 메인 컨트롤러: 로그인 · 화면 전환 · 스테이지(페이지네이션) · 솔버 호출 · 서버 기록 */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const PAGE_SIZE = 10;   // 페이지당 스테이지 수
  const TOTAL_PAGES = 5;  // 1~5페이지 = 난이도 별 1~5개

  let STAGES = [];
  let RECORDS = {};       // 서버 기록 캐시 {stage_id: {attempts, cleared, hint_used, cleared_at}}
  let currentUser = null; // {username}
  let page = 0;           // 현재 페이지(0~4)

  let stage = null;
  let mode = "manual";
  let result = null;
  let source = "search";
  let maxLogged = -1;
  let clearOverlayShown = false;

  const boardWrap = $("boardWrap");
  const view = new BoardView($("board"), { cell: 28, hiddenRows: 2 });

  const player = new Player(view, {
    baseDelay: 340,
    onFrame,
    onEnd,
    onStateChange: syncTransport,
  });

  const manual = new ManualGame(view, { onState: onManualState });

  // ----------------------------------------------------------------- API
  async function api(path, opts) {
    const res = await fetch(path, opts);
    let data = {};
    try { data = await res.json(); } catch (_) { /* 본문 없음 */ }
    if (!res.ok) throw new Error(data.error || `요청 실패 (${res.status})`);
    return data;
  }

  function jsonPost(path, body) {
    return api(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
  }

  // ----------------------------------------------------------------- 초기화
  async function init() {
    const [pieces, stages] = await Promise.all([
      fetch("/api/pieces").then((r) => r.json()),
      fetch("/api/stages").then((r) => r.json()),
    ]);

    for (const [type, info] of Object.entries(pieces)) {
      PIECE_COLORS[type] = info.color;
      PIECE_ROTATIONS[type] = info.rotations;
    }
    STAGES = stages;

    bindControls();
    syncTransport();
    syncModeButtons();

    // 세션 복원: 이미 로그인돼 있으면 홈으로, 아니면 로그인 화면
    try {
      const me = await fetch("/api/me").then((r) => r.json());
      if (me.user) {
        await onLoggedIn(me.user);
        return;
      }
    } catch (_) { /* 무시하고 로그인 화면 */ }
    showScreen("login");
  }

  // ----------------------------------------------------------------- 로그인/계정
  async function onLoggedIn(user) {
    currentUser = user;
    $("homeUser").textContent = `👤 ${user.username}`;
    await loadRecords();
    showScreen("home");
  }

  async function loadRecords() {
    try {
      const data = await api("/api/records");
      RECORDS = data.records || {};
    } catch (_) {
      RECORDS = {};
    }
  }

  function setLoginError(msg) {
    $("loginError").textContent = msg || "";
  }

  async function submitAuth(path) {
    const username = $("loginUser").value.trim();
    const password = $("loginPass").value;
    if (!username || !password) {
      setLoginError("아이디와 비밀번호를 입력하세요.");
      return;
    }
    try {
      const data = await jsonPost(path, { username, password });
      setLoginError("");
      $("loginPass").value = "";
      await onLoggedIn(data.user);
    } catch (e) {
      setLoginError(e.message);
    }
  }

  async function doLogout() {
    try { await jsonPost("/api/logout"); } catch (_) { /* 무시 */ }
    currentUser = null;
    RECORDS = {};
    stage = null;
    player.pause();
    $("loginUser").value = "";
    $("loginPass").value = "";
    setLoginError("");
    showScreen("login");
  }

  // ----------------------------------------------------------------- 화면 전환
  function showScreen(name) {
    document.querySelectorAll(".screen").forEach((screen) => {
      screen.classList.toggle("hidden", screen.id !== `screen-${name}`);
    });

    if (name !== "game") player.pause();
    if (name === "stages") buildStageGrid();
    if (name === "records") renderRecords();
  }

  // ----------------------------------------------------------------- 페이지네이션
  function renderStars() {
    let html = "";
    for (let i = 0; i < TOTAL_PAGES; i++) {
      html += `<span class="star ${i <= page ? "on" : ""}">★</span>`;
    }
    $("pageStars").innerHTML = html;
    $("pageIndicator").textContent =
      `난이도 ${page + 1} / ${TOTAL_PAGES} · 스테이지 ${page * PAGE_SIZE + 1}–${(page + 1) * PAGE_SIZE}`;
    $("pagePrev").disabled = page <= 0;
    $("pageNext").disabled = page >= TOTAL_PAGES - 1;
  }

  function changePage(delta) {
    const next = page + delta;
    if (next < 0 || next >= TOTAL_PAGES) return;
    page = next;
    buildStageGrid();
  }

  function buildStageGrid() {
    const grid = $("stageGrid");
    grid.innerHTML = "";
    renderStars();

    const start = page * PAGE_SIZE;
    for (let slot = 0; slot < PAGE_SIZE; slot++) {
      const idx = start + slot; // 전역 스테이지 인덱스(0-base)
      const s = STAGES[idx];
      const no = idx + 1;       // 화면 표시용 스테이지 번호

      if (!s) {
        // 아직 만들어지지 않은 스테이지 = '준비 중' 잠금 자리표시
        const lock = document.createElement("div");
        lock.className = "stage-node locked";
        lock.title = "준비 중";
        lock.innerHTML = `<span class="stage-no">${no}</span><span class="lock-ico">🔒</span>`;
        grid.appendChild(lock);
        continue;
      }

      const rec = RECORDS[s.id];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "stage-node";
      if (rec && rec.cleared) btn.classList.add("cleared");
      if (s.id === "no-solution") btn.classList.add("challenge");
      btn.setAttribute("aria-label", `스테이지 ${no}`);
      btn.addEventListener("click", () => startStage(s.id));

      const num = document.createElement("span");
      num.className = "stage-no";
      num.textContent = no;
      btn.appendChild(num);

      if (rec && rec.cleared) {
        const chk = document.createElement("span");
        chk.className = "stage-check";
        chk.textContent = "✓";
        btn.appendChild(chk);
      }
      if (rec && rec.hint_used) {
        const hint = document.createElement("span");
        hint.className = "stage-hint";
        hint.textContent = "💡";
        btn.appendChild(hint);
      }
      grid.appendChild(btn);
    }
  }

  // ----------------------------------------------------------------- 스테이지 진행
  function startStage(id) {
    selectStage(id);
    showScreen("game");
  }

  function selectStage(id) {
    stage = STAGES.find((s) => s.id === id);
    if (!stage) return;
    const idx = STAGES.findIndex((s) => s.id === id);
    if (idx >= 0) page = Math.floor(idx / PAGE_SIZE);

    result = null;
    source = "search";
    maxLogged = -1;
    clearOverlayShown = false;
    hideClearOverlay();
    hideBanner();
    resetStats();
    clearLog();

    $("gameTitle").textContent = `스테이지 ${idx + 1}`;
    $("manualResult").textContent = "";
    $("manualResult").className = "manual-result";
    $("pruneCompare").classList.add("hidden");
    syncModeButtons();

    buildQueueStrip();
    view.setDims(stage.width, stage.height);
    player.load([]);

    if (mode === "ai") {
      view.render({
        board: emptyBoard(stage.height, stage.width, stage.garbage),
        queue: stage.queue,
        active: null,
        tint: null,
        showNumbers: true,
      });
    } else {
      manual.start(stage);
      countAttempt(); // 새 한 판 시작 → 시도 +1(클리어 전까지)
    }
  }

  function buildQueueStrip() {
    const strip = $("queueStrip");
    strip.innerHTML = "";
    stage.queue.forEach((type, i) => {
      const wrap = document.createElement("div");
      wrap.className = "qpiece";
      wrap.dataset.idx = i;

      const ord = document.createElement("span");
      ord.className = "ord";
      ord.textContent = i + 1;

      const canvas = document.createElement("canvas");
      wrap.append(ord, canvas);
      strip.appendChild(wrap);
      drawMiniPiece(canvas, type, i + 1);
    });
  }

  function highlightQueue(currentIdx, doneUpTo) {
    document.querySelectorAll(".qpiece").forEach((el) => {
      const i = Number(el.dataset.idx);
      el.classList.toggle("current", i === currentIdx);
      el.classList.toggle("done", doneUpTo != null && i < doneUpTo);
    });
  }

  function setMode(nextMode) {
    if (!stage) return;
    mode = nextMode;
    player.pause();
    hideClearOverlay();
    syncModeButtons();
    selectStage(stage.id);
  }

  function syncModeButtons() {
    $("aiControls").classList.toggle("hidden", mode !== "ai");
    $("modeBadge").textContent = mode === "ai" ? "AI" : "직접";
    $("modeBadge").classList.toggle("ai", mode === "ai");
  }

  // ----------------------------------------------------------------- 기록 갱신(서버)
  function countAttempt() {
    if (!stage) return;
    const rec = RECORDS[stage.id] || { attempts: 0, cleared: false, hint_used: false };
    if (rec.cleared) return; // 클리어 후에는 시도 횟수 고정
    RECORDS[stage.id] = { ...rec, attempts: rec.attempts + 1 }; // 낙관적 +1
    jsonPost("/api/records/attempt", { stage_id: stage.id })
      .then((d) => { RECORDS[stage.id] = d.record; })
      .catch(() => {});
  }

  function recordClear() {
    const rec = RECORDS[stage.id] || { attempts: 0, cleared: false, hint_used: false };
    if (rec.cleared) return;
    RECORDS[stage.id] = { ...rec, cleared: true }; // 낙관적 반영(재시도 시 시도 중복 방지)
    jsonPost("/api/records/clear", { stage_id: stage.id })
      .then((d) => { RECORDS[stage.id] = d.record; })
      .catch(() => {});
  }

  function markHint() {
    if (!stage) return;
    const rec = RECORDS[stage.id] || { attempts: 0, cleared: false, hint_used: false };
    if (rec.hint_used) return;
    RECORDS[stage.id] = { ...rec, hint_used: true };
    jsonPost("/api/records/hint", { stage_id: stage.id })
      .then((d) => { RECORDS[stage.id] = d.record; })
      .catch(() => {});
  }

  // ----------------------------------------------------------------- AI 솔버
  async function solveBoth() {
    const reqs = [true, false].map((pruning) =>
      jsonPost("/api/solve", { stage_id: stage.id, pruning })
    );
    const [on, off] = await Promise.all(reqs);
    return { on, off };
  }

  async function runSearch() {
    if (!stage) return;
    markHint(); // AI 탐색 = 힌트 사용
    setBusy(true);
    hideClearOverlay();
    clearOverlayShown = false;

    try {
      const { on, off } = await solveBoth();
      const usePrune = $("pruneToggle").checked;
      result = usePrune ? on : off;
      source = "search";
      showCompare(on.stats, off.stats, result);
      clearLog();
      maxLogged = -1;

      const frames = framesFromHistory(result);
      player.load(frames);
      if (frames.length) {
        player.seek(0);
        player.play();
      }
    } catch (e) {
      showBanner("오류: " + e.message, "prune");
    } finally {
      setBusy(false);
    }
  }

  async function runSolution() {
    if (!stage) return;
    markHint(); // 정답 재생 = 힌트 사용
    setBusy(true);
    hideClearOverlay();
    clearOverlayShown = false;

    try {
      const r = await jsonPost("/api/solve", { stage_id: stage.id, pruning: true });
      result = r;
      source = "solution";
      if (!r.solved) {
        showBanner("해 없음 · 정답이 존재하지 않습니다", "prune");
        player.load([]);
        return;
      }
      clearLog();
      maxLogged = -1;
      player.load(framesFromSolution(r));
      player.seek(0);
      player.play();
    } catch (e) {
      showBanner("오류: " + e.message, "prune");
    } finally {
      setBusy(false);
    }
  }

  function onFrame(idx, frame) {
    $("scrubber").value = idx;
    $("frameLabel").textContent = `${idx + 1} / ${player.total}`;

    if (frame.ev) {
      $("stNodes").textContent = frame.ev.nodes;
      $("stBack").textContent = frame.ev.backtracks;
      $("stPrune").textContent = frame.ev.prunes;
      $("stDepth").textContent = frame.ev.depth != null ? frame.ev.depth + 1 : "-";
    }

    let cur = -1;
    let done = 0;
    if (frame.ev && frame.ev.order) {
      cur = frame.ev.order - 1;
      done = frame.ev.depth;
    } else if (source === "solution" && frame.type === "place") {
      const match = /^(\d+)번/.exec(frame.banner || "");
      if (match) {
        cur = Number(match[1]) - 1;
        done = cur;
      }
    }
    if (frame.type === "clear") {
      cur = -1;
      done = frame.ev ? frame.ev.depth + 1 : frame.order || done;
    }
    if (frame.type === "solution") {
      cur = -1;
      done = stage.queue.length;
    }
    highlightQueue(cur, done);

    if (frame.banner) showBanner(frame.banner, frame.bannerKind);
    else hideBanner();

    if (frame.flash) {
      boardWrap.classList.remove("flash");
      void boardWrap.offsetWidth;
      boardWrap.classList.add("flash");
    }

    if (idx > maxLogged) {
      maxLogged = idx;
      appendLog(frame);
    }

    if (idx === player.total - 1 && frame.type === "solution" && result && result.solved) {
      // AI/정답 재생으로 본 것은 '힌트'이며 클리어로 기록하지 않는다.
      showClearOverlay(source === "solution" ? "정답 재생" : "AI 탐색", false);
    }
  }

  function onEnd() {
    if (source === "search" && result && !result.solved) {
      showBanner("NO SOLUTION · 해 없음", "prune");
    }
  }

  function showCompare(on, off, used) {
    const el = $("pruneCompare");
    const saved = off.nodes ? Math.round((1 - on.nodes / off.nodes) * 100) : 0;
    el.classList.remove("hidden");
    el.innerHTML =
      `가지치기 <b>ON</b>: 탐색 노드 <b>${on.nodes}</b> · 이벤트 ${on.events}<br>` +
      `가지치기 <b>OFF</b>: 탐색 노드 <b>${off.nodes}</b> · 이벤트 ${off.events}<br>` +
      `→ 플러드 필 가지치기로 탐색 노드 <b>${saved}%</b> 감축` +
      (used && used.solved ? "" : "<br><span style='color:#fca5a5'>※ 이 스테이지는 해가 없습니다</span>");
  }

  // ----------------------------------------------------------------- 클리어 오버레이
  function stageNumber() {
    return STAGES.findIndex((s) => s.id === stage.id) + 1;
  }

  function showClearOverlay(clearMode, record) {
    if (clearOverlayShown || !stage) return;
    clearOverlayShown = true;
    if (record) recordClear();

    const overlay = $("clearOverlay");
    $("overlayEmoji").textContent = clearMode === "직접 플레이" ? "🎮" : "🎉";

    if (clearMode === "직접 플레이") {
      $("overlayTitle").textContent = `스테이지 ${stageNumber()} 클리어!`;
      const rec = RECORDS[stage.id];
      const tries = rec ? rec.attempts : 1;
      const hint = rec && rec.hint_used ? " · 힌트 사용" : "";
      $("overlayStats").textContent = `직접 플레이 성공 · 시도 ${tries}회${hint}`;
    } else {
      $("overlayTitle").textContent = `스테이지 ${stageNumber()} · 정답 재생`;
      const nodes = result && result.stats ? result.stats.nodes : 0;
      $("overlayStats").textContent = `${clearMode} · 탐색 노드 ${nodes}개 (힌트)`;
    }

    const idx = STAGES.findIndex((s) => s.id === stage.id);
    const hasNext = idx >= 0 && idx < STAGES.length - 1;
    $("ovNext").disabled = !hasNext;
    $("ovNext").classList.toggle("hidden", !hasNext);
    overlay.classList.remove("hidden");
  }

  function hideClearOverlay() {
    $("clearOverlay").classList.add("hidden");
  }

  // ----------------------------------------------------------------- 기록 화면
  function renderRecords() {
    const list = $("recordsList");
    list.innerHTML = "";

    STAGES.forEach((s, idx) => {
      const rec = RECORDS[s.id];
      const attempts = rec ? rec.attempts : 0;
      const hintUsed = !!(rec && rec.hint_used);

      const item = document.createElement("div");
      item.className = "record-item";
      if (rec && rec.cleared) item.classList.add("cleared");

      const badge = document.createElement("div");
      badge.className = "record-badge";
      badge.textContent = idx + 1;

      const body = document.createElement("div");
      body.className = "record-body";

      const title = document.createElement("div");
      title.className = "record-title";
      title.textContent = `스테이지 ${idx + 1}`;

      const meta = document.createElement("div");
      meta.className = "record-meta";
      const hintTag = hintUsed ? ` <span class="tag hint">💡 힌트 사용</span>` : "";
      if (rec && rec.cleared) {
        meta.innerHTML = `<span class="tag ok">✓ 클리어</span> 시도 ${attempts}회${hintTag}`;
      } else if (attempts > 0) {
        meta.innerHTML = `<span class="tag try">도전 중</span> 시도 ${attempts}회${hintTag}`;
      } else {
        meta.innerHTML = `<span class="tag muted">미플레이</span>${hintTag}`;
      }

      body.append(title, meta);
      item.append(badge, body);
      list.appendChild(item);
    });
  }

  // ----------------------------------------------------------------- 기타 UI
  function appendLog(frame) {
    const ul = $("log");
    if (!ul) return;
    const li = document.createElement("li");
    li.className = frame.type || "";
    li.textContent = frame.msg || "";
    ul.appendChild(li);
    while (ul.children.length > 250) ul.removeChild(ul.firstChild);
    ul.scrollTop = ul.scrollHeight;
  }

  function clearLog() {
    const ul = $("log");
    if (ul) ul.innerHTML = "";
  }

  function resetStats() {
    $("stNodes").textContent = "0";
    $("stBack").textContent = "0";
    $("stPrune").textContent = "0";
    $("stDepth").textContent = "-";
    $("scrubber").value = 0;
    $("scrubber").max = 0;
    $("frameLabel").textContent = "0 / 0";
  }

  function showBanner(text, kind) {
    const banner = $("banner");
    banner.textContent = text;
    banner.className = "banner " + (kind || "");
  }

  function hideBanner() {
    $("banner").className = "banner hidden";
  }

  function setBusy(busy) {
    $("btnSolve").disabled = busy;
    $("btnSolution").disabled = busy;
  }

  function syncTransport() {
    $("scrubber").max = Math.max(0, player.total - 1);
  }

  function onManualState(st) {
    highlightQueue(st.result ? -1 : st.idx, st.idx);
    const res = $("manualResult");

    if (st.result === "win") {
      res.textContent = "퍼펙트 클리어 성공!";
      res.className = "manual-result win";
      showBanner("PERFECT CLEAR", "win");
      boardWrap.classList.remove("flash");
      void boardWrap.offsetWidth;
      boardWrap.classList.add("flash");
      showClearOverlay("직접 플레이", true);
    } else if (st.result === "lose") {
      res.textContent = "보드를 다 비우지 못했습니다. (R 로 다시)";
      res.className = "manual-result lose";
      hideBanner();
    } else {
      res.textContent = "";
      res.className = "manual-result";
      hideBanner();
    }
  }

  // ----------------------------------------------------------------- 이벤트 바인딩
  function bindControls() {
    // 로그인 화면
    $("loginForm").addEventListener("submit", (e) => {
      e.preventDefault();
      submitAuth("/api/login");
    });
    $("registerSubmit").addEventListener("click", () => submitAuth("/api/register"));

    // 홈
    $("homePlay").addEventListener("click", () => showScreen("stages"));
    $("homeCustom").addEventListener("click", () => alert("커스텀은 준비 중입니다."));
    $("homeRecords").addEventListener("click", () => showScreen("records"));
    $("homeLogout").addEventListener("click", doLogout);
    $("homeExit").addEventListener("click", () => {
      window.close();
      setTimeout(() => {
        if (!window.closed) document.body.classList.add("app-closed");
      }, 100);
    });

    // 화면 이동
    $("stagesBack").addEventListener("click", () => showScreen("home"));
    $("recordsBack").addEventListener("click", () => showScreen("home"));
    $("gameBack").addEventListener("click", () => showScreen("stages"));

    // 페이지(난이도) 화살표
    $("pagePrev").addEventListener("click", () => changePage(-1));
    $("pageNext").addEventListener("click", () => changePage(1));

    // 기록 초기화
    $("recordsReset").addEventListener("click", async () => {
      if (!confirm("기록을 모두 초기화할까요?")) return;
      try { await jsonPost("/api/records/reset"); } catch (_) { /* 무시 */ }
      RECORDS = {};
      renderRecords();
    });

    // 클리어 오버레이
    $("ovNext").addEventListener("click", () => {
      const idx = STAGES.findIndex((s) => s.id === stage.id);
      if (idx >= 0 && idx < STAGES.length - 1) startStage(STAGES[idx + 1].id);
    });
    $("ovRetry").addEventListener("click", () => selectStage(stage.id));
    $("ovHome").addEventListener("click", () => showScreen("home"));

    // AI 컨트롤
    $("btnSolve").addEventListener("click", runSearch);
    $("btnSolution").addEventListener("click", runSolution);
    $("speed").addEventListener("input", (e) => {
      const speed = parseFloat(e.target.value);
      player.setSpeed(speed);
      $("speedLabel").textContent = speed.toFixed(1) + "x";
    });
    $("scrubber").addEventListener("input", (e) => player.seek(Number(e.target.value)));
    $("pruneToggle").addEventListener("change", () => {
      if (result && source === "search") runSearch();
    });

    // 게임 키보드
    document.addEventListener("keydown", (e) => {
      if ($("screen-game").classList.contains("hidden")) return;
      const key = e.key;
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "r", "R", "b", "B"].includes(key)) {
        e.preventDefault();
      }
      if (key === "b" || key === "B") {
        setMode(mode === "ai" ? "manual" : "ai");
        return;
      }
      if (mode !== "manual") return;
      if (key === "ArrowLeft") manual.move(-1);
      else if (key === "ArrowRight") manual.move(1);
      else if (key === "ArrowUp") manual.rotate();
      else if (key === "ArrowDown" || key === " ") manual.hardDrop();
      else if (key === "r" || key === "R") selectStage(stage.id);
    });
  }

  init();
})();
