/* 공용 유틸 + 프론트엔드 측 경량 테트리스 엔진(직접 플레이/정답 재생용).
   백엔드 engine.py 의 핵심 로직을 자바스크립트로 옮긴 것. */

// /api/pieces 로 채워지는 전역 메타데이터
const PIECE_COLORS = {};      // {T: '#c084fc', ...}
const PIECE_ROTATIONS = {};   // {T: [[[r,c],...], ...], ...}

// 캔버스 렌더링용 색상 팔레트
const PALETTE = {
  empty: "#0e1626",
  emptyGrid: "#1e2a42",
  garbage: "#64748b",
  garbageHatch: "#475569",
  red: "#ef4444",
  border: "#26344f",
  borderRed: "#ef4444",
  borderGreen: "#22c55e",
  text: "rgba(6,10,20,0.85)",
  textLight: "rgba(255,255,255,0.92)",
};

function emptyBoard(h, w, garbage) {
  const b = Array.from({ length: h }, () => Array(w).fill(0));
  if (garbage) for (const [r, c] of garbage) b[r][c] = -1;
  return b;
}

function cloneBoard(b) {
  return b.map((row) => row.slice());
}

function pieceDims(cells) {
  let h = 0, w = 0;
  for (const [r, c] of cells) {
    if (r + 1 > h) h = r + 1;
    if (c + 1 > w) w = c + 1;
  }
  return [h, w];
}

// 위→아래 직선 낙하 시 안착하는 최상단 행. 놓을 수 없으면 null.
function dropRowJS(board, cells, col) {
  const H = board.length, W = board[0].length;
  const [h, w] = pieceDims(cells);
  if (col < 0 || col + w > W) return null;
  let best = null;
  for (let r0 = 0; r0 <= H - h; r0++) {
    let fits = true;
    for (const [r, c] of cells) {
      if (board[r0 + r][col + c] !== 0) { fits = false; break; }
    }
    if (fits) best = r0; else break;
  }
  return best;
}

// 가득 찬 줄 제거(보드 in-place 수정). 제거된 행 인덱스 배열 반환.
function clearLinesJS(board) {
  const H = board.length, W = board[0].length;
  const full = [];
  for (let i = 0; i < H; i++) if (board[i].every((v) => v !== 0)) full.push(i);
  if (!full.length) return [];
  const fset = new Set(full);
  const kept = board.filter((_, i) => !fset.has(i));
  while (kept.length < H) kept.unshift(Array(W).fill(0));
  for (let i = 0; i < H; i++) board[i] = kept[i];
  return full;
}

function isEmptyJS(board) {
  return board.every((row) => row.every((v) => v === 0));
}

// 정답(배치 순서)을 재생용 프레임으로 변환 (실제 줄 제거를 적용)
function framesFromSolution(result) {
  const { width, height, garbage, queue, solution } = result;
  let board = emptyBoard(height, width, garbage);
  const frames = [];
  for (const step of solution) {
    for (const [r, c] of step.cells) board[r][c] = step.order;
    frames.push({
      board: cloneBoard(board), queue, active: step.cells,
      tint: null, showNumbers: true, type: "place",
      banner: `${step.order}번`, bannerKind: "ok",
      msg: `${step.order}번 블록 [${step.piece}] 안착 (${step.col}열 · ${step.rotation * 90}°)`,
    });
    const cleared = clearLinesJS(board); // board 를 in-place 로 줄 제거
    if (cleared.length) {
      frames.push({
        board: cloneBoard(board), queue, active: null,
        tint: "green", showNumbers: true, flash: true, type: "clear",
        order: step.order,
        banner: "LINE CLEAR", bannerKind: "win",
        msg: `가득 찬 ${cleared.length}줄 제거!`,
      });
    }
  }
  // 최종(퍼펙트 클리어) 프레임
  frames.push({
    board: cloneBoard(board), queue, active: null,
    tint: "green", showNumbers: true, type: "solution",
    banner: "PERFECT CLEAR", bannerKind: "win",
    msg: "모든 블록을 사용해 보드를 완전히 비웠습니다 — Perfect Clear! ✨",
  });
  return frames;
}

// 탐색 히스토리를 재생용 프레임으로 변환
function framesFromHistory(result) {
  const queue = result.queue;
  return result.history.map((ev) => {
    let tint = null, bannerKind = null, banner = null;
    if (ev.type === "prune") { tint = "red"; bannerKind = "prune"; banner = "PRUNE ✂"; }
    else if (ev.type === "backtrack") { tint = "red"; bannerKind = "back"; banner = "BACKTRACK ↩"; }
    else if (ev.type === "solution") { tint = "green"; bannerKind = "ok"; banner = "SOLVED"; }
    else if (ev.type === "clear") { tint = "green"; bannerKind = "win"; banner = "LINE CLEAR"; }
    return {
      board: ev.board, queue, active: ev.active || null,
      tint, showNumbers: true, flash: ev.type === "clear",
      type: ev.type, banner, bannerKind, msg: ev.msg, ev,
    };
  });
}
