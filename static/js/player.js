/* 프레임 타임라인 재생기.
   배속(speed)에 따라 setInterval 의 대기 시간(ms)을 실시간으로 다시 연결한다.
   (요구사항: 슬라이더 ↔ setInterval 대기시간 실시간 연동) */
class Player {
  constructor(view, opts = {}) {
    this.view = view;
    this.frames = [];
    this.index = -1;
    this.timer = null;
    this.playing = false;
    this.speed = 1.0;
    this.baseDelay = opts.baseDelay || 340; // 1배속 기준 프레임 간격(ms)
    this.onFrame = opts.onFrame || (() => {});
    this.onEnd = opts.onEnd || (() => {});
    this.onStateChange = opts.onStateChange || (() => {});
  }

  load(frames) {
    this.pause();
    this.frames = frames || [];
    this.index = -1;
    if (this.frames.length) {
      this.index = 0;
      this._show();
    }
    this.onStateChange();
  }

  get total() {
    return this.frames.length;
  }

  delay() {
    return Math.round(this.baseDelay / this.speed);
  }

  setSpeed(s) {
    this.speed = s;
    if (this.playing) this._startTimer(); // 재생 중이면 즉시 새 간격으로 교체
  }

  _startTimer() {
    clearInterval(this.timer);
    this.timer = setInterval(() => this._advance(), this.delay());
  }

  _advance() {
    if (this.index >= this.total - 1) {
      this.pause();
      this.onEnd();
      return;
    }
    this.index += 1;
    this._show();
  }

  _show() {
    const f = this.frames[this.index];
    if (!f) return;
    this.view.render(f);
    this.onFrame(this.index, f);
  }

  play() {
    if (this.playing || !this.total) return;
    if (this.index >= this.total - 1) this.index = -1; // 끝이면 처음부터
    this.playing = true;
    this._startTimer();
    this.onStateChange();
  }

  pause() {
    this.playing = false;
    clearInterval(this.timer);
    this.timer = null;
    this.onStateChange();
  }

  toggle() {
    this.playing ? this.pause() : this.play();
  }

  stepForward() {
    this.pause();
    if (this.index < this.total - 1) { this.index += 1; this._show(); }
  }

  stepBack() {
    this.pause();
    if (this.index > 0) { this.index -= 1; this._show(); }
  }

  seek(i) {
    this.pause();
    this.index = Math.max(0, Math.min(this.total - 1, i));
    this._show();
  }

  reset() {
    this.pause();
    this.index = this.total ? 0 : -1;
    if (this.index >= 0) this._show();
  }
}
