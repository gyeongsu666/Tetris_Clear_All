/* 직접 플레이 모드.
   고정된 블록 큐를 순서대로 받아, 열 이동(←/→)·회전(↑)으로 위치를 정하고
   하드드롭(Space/↓)으로 안착시킨다. 모든 블록 사용 후 보드가 비면 퍼펙트 클리어. */
class ManualGame {
  constructor(view, opts = {}) {
    this.view = view;
    this.onState = opts.onState || (() => {});
  }

  start(stage) {
    this.w = stage.width;
    this.h = stage.height;
    this.queue = stage.queue.slice();
    this.garbage = stage.garbage || [];
    this.board = emptyBoard(this.h, this.w, this.garbage);
    this.idx = 0;
    this.placedCount = 0;
    this.result = null; // null | 'win' | 'lose'
    this.view.setDims(this.w, this.h);
    this._spawn();
  }

  _cells() {
    return PIECE_ROTATIONS[this.piece][this.rot];
  }

  _spawn() {
    if (this.idx >= this.queue.length) { this._finish(); return; }
    this.piece = this.queue[this.idx];
    this.rot = 0;
    const [, w] = pieceDims(this._cells());
    this.col = Math.max(0, Math.floor((this.w - w) / 2));
    // 현재 블록을 어디에도 놓을 수 없으면 패배
    if (!this._anyPlacement()) {
      this.result = "lose";
    }
    this.render();
  }

  _anyPlacement() {
    const rots = PIECE_ROTATIONS[this.piece];
    for (let ri = 0; ri < rots.length; ri++) {
      const [, w] = pieceDims(rots[ri]);
      for (let c = 0; c <= this.w - w; c++) {
        if (dropRowJS(this.board, rots[ri], c) !== null) return true;
      }
    }
    return false;
  }

  _landingRow() {
    return dropRowJS(this.board, this._cells(), this.col);
  }

  move(dir) {
    if (this.result) return;
    const [, w] = pieceDims(this._cells());
    const nc = this.col + dir;
    if (nc >= 0 && nc + w <= this.w) { this.col = nc; this.render(); }
  }

  rotate() {
    if (this.result) return;
    const rots = PIECE_ROTATIONS[this.piece];
    const nr = (this.rot + 1) % rots.length;
    const [, w] = pieceDims(rots[nr]);
    let nc = this.col;
    if (nc + w > this.w) nc = this.w - w; // 벽에 걸리면 안쪽으로 보정
    if (nc < 0) return;
    this.rot = nr;
    this.col = nc;
    this.render();
  }

  hardDrop() {
    if (this.result) return;
    const r0 = this._landingRow();
    if (r0 === null) return; // 현재 열에는 못 놓음
    const order = this.idx + 1;
    for (const [r, c] of this._cells()) this.board[r0 + r][this.col + c] = order;
    this.placedCount += 1;
    this.lastCleared = clearLinesJS(this.board);
    this.idx += 1;
    this._spawn();
  }

  _finish() {
    this.piece = null;
    this.result = isEmptyJS(this.board) ? "win" : "lose";
    this.render();
  }

  render() {
    let falling = null;
    if (this.piece && !this.result) {
      const r0 = this._landingRow();
      if (r0 !== null) {
        const cells = this._cells().map(([r, c]) => [r0 + r, this.col + c]);
        falling = { cells, type: this.piece };
      }
    }
    let tint = null;
    if (this.result === "win") tint = "green";
    this.view.render({
      board: this.board, queue: this.queue, active: null,
      falling, tint, showNumbers: true,
    });
    this.onState({
      idx: this.idx,
      total: this.queue.length,
      piece: this.piece,
      result: this.result,
      remaining: this.queue.length - this.idx,
    });
  }
}
