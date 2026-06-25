/* 캔버스 기반 보드 렌더러.
   frame = {
     board, queue,
     active   : [[r,c],...]   // 방금 놓은(혹은 강조할) 칸
     falling  : {cells, type} // 직접 플레이의 낙하 미리보기(반투명)
     tint     : 'red'|'green'|null
     showNumbers : bool
   }
*/
class BoardView {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.cell = opts.cell || 28; // 모든 스테이지 공통 칸 크기(px)
    this.hiddenRows = opts.hiddenRows || 0;
    this.w = 10;
    this.h = 22;
    this.visibleH = 20;
  }

  setDims(w, h) {
    this.w = w;
    this.h = h;
    this.visibleH = Math.max(1, h - this.hiddenRows);
    this._fit();
  }

  _fit() {
    const cssW = this.w * this.cell;
    const cssH = this.visibleH * this.cell;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.canvas.style.width = cssW + "px";
    this.canvas.style.height = cssH + "px";
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  _roundRect(x, y, w, h, r) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  render(frame) {
    const ctx = this.ctx;
    const cell = this.cell;
    const W = this.w * cell;
    const H = this.visibleH * cell;
    ctx.clearRect(0, 0, W, H);

    const active = new Set((frame.active || []).map(([r, c]) => r + "," + c));

    // 칸 그리기
    for (let vr = 0; vr < this.visibleH; vr++) {
      const r = vr + this.hiddenRows;
      for (let c = 0; c < this.w; c++) {
        const v = frame.board[r][c];
        const isActive = active.has(r + "," + c);
        this._drawCell(vr, c, v, frame, isActive);
      }
    }

    // 낙하 미리보기(직접 플레이)
    if (frame.falling) {
      const color = PIECE_COLORS[frame.falling.type] || "#94a3b8";
      for (const [r, c] of frame.falling.cells) {
        if (r < this.hiddenRows) continue;
        const x = c * cell, y = (r - this.hiddenRows) * cell;
        ctx.save();
        ctx.globalAlpha = 0.45;
        this._roundRect(x + 2, y + 2, cell - 4, cell - 4, 5);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.restore();
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        this._roundRect(x + 2, y + 2, cell - 4, cell - 4, 5);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // 보드 테두리(역추적=빨강, 정답=초록)
    let borderColor = PALETTE.border;
    let borderW = 2;
    if (frame.tint === "red") { borderColor = PALETTE.borderRed; borderW = 4; }
    else if (frame.tint === "green") { borderColor = PALETTE.borderGreen; borderW = 4; }
    ctx.lineWidth = borderW;
    ctx.strokeStyle = borderColor;
    ctx.strokeRect(borderW / 2, borderW / 2, W - borderW, H - borderW);
  }

  _drawCell(r, c, v, frame, isActive) {
    const ctx = this.ctx;
    const cell = this.cell;
    const x = c * cell, y = r * cell;
    const pad = 1.5;

    if (v === 0) {
      // 빈 칸
      this._roundRect(x + pad, y + pad, cell - 2 * pad, cell - 2 * pad, 4);
      ctx.fillStyle = PALETTE.empty;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = PALETTE.emptyGrid;
      ctx.stroke();
      return;
    }

    // 채워진 칸 색 결정
    let fill;
    if (v === -1) fill = PALETTE.garbage;
    else fill = PIECE_COLORS[frame.queue[v - 1]] || "#94a3b8";
    if (isActive && frame.tint === "red") fill = PALETTE.red; // 역추적 강조

    this._roundRect(x + pad, y + pad, cell - 2 * pad, cell - 2 * pad, 4);
    ctx.fillStyle = fill;
    ctx.fill();

    // 입체감(상단 하이라이트 / 하단 음영)
    ctx.save();
    this._roundRect(x + pad, y + pad, cell - 2 * pad, cell - 2 * pad, 4);
    ctx.clip();
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(x, y, cell, cell * 0.32);
    ctx.fillStyle = "rgba(0,0,0,0.16)";
    ctx.fillRect(x, y + cell * 0.7, cell, cell * 0.3);
    ctx.restore();

    // 가비지 빗금
    if (v === -1) {
      ctx.save();
      this._roundRect(x + pad, y + pad, cell - 2 * pad, cell - 2 * pad, 4);
      ctx.clip();
      ctx.strokeStyle = PALETTE.garbageHatch;
      ctx.lineWidth = 2;
      for (let i = -cell; i < cell; i += 6) {
        ctx.beginPath();
        ctx.moveTo(x + i, y);
        ctx.lineTo(x + i + cell, y + cell);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 순서 번호 각인
    if (v > 0 && frame.showNumbers) {
      ctx.font = `700 ${Math.round(cell * 0.42)}px "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(255,255,255,0.65)";
      ctx.strokeText(String(v), x + cell / 2, y + cell / 2 + 1);
      ctx.fillStyle = PALETTE.text;
      ctx.fillText(String(v), x + cell / 2, y + cell / 2 + 1);
    }

    // 활성 칸 외곽선
    if (isActive) {
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = frame.tint === "red" ? "#fecaca" : "rgba(255,255,255,0.95)";
      this._roundRect(x + pad, y + pad, cell - 2 * pad, cell - 2 * pad, 4);
      ctx.stroke();
    }
  }
}

/* 작은 블록 미리보기(대기열 표시)를 캔버스에 그린다. */
function drawMiniPiece(canvas, type, order) {
  const rot = (PIECE_ROTATIONS[type] || [[[0, 0]]])[0];
  const [h, w] = pieceDims(rot);
  const cell = Math.floor(Math.min(46 / w, 30 / h));
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const cssW = 52, cssH = 34;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  canvas.style.width = cssW + "px";
  canvas.style.height = cssH + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  const offX = (cssW - w * cell) / 2;
  const offY = (cssH - h * cell) / 2;
  const color = PIECE_COLORS[type] || "#94a3b8";
  for (const [r, c] of rot) {
    const x = offX + c * cell, y = offY + r * cell;
    ctx.fillStyle = color;
    ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(x + 1, y + 1, cell - 2, (cell - 2) * 0.35);
  }
}
