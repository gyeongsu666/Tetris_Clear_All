"""Flask 백엔드 진입점.

엔드포인트
  GET  /                      메인 페이지(테트리스 시각화 UI)
  GET  /api/pieces            7종 블록의 색상/회전 메타데이터
  GET  /api/stages            스테이지 목록(보드 크기/큐/가비지)
  POST /api/solve             백트래킹 실행 → 탐색 히스토리 + 정답 + 통계 반환

  계정/기록 (유저별 로컬 SQLite 저장)
  POST /api/register          회원가입(아이디/비밀번호) 후 자동 로그인
  POST /api/login             로그인
  POST /api/logout            로그아웃
  GET  /api/me                현재 로그인 사용자 조회(세션 복원용)
  GET  /api/records           현재 사용자의 스테이지 기록 전체
  POST /api/records/attempt   {stage_id} 새 한 판 시작 → 시도 +1(클리어 전까지)
  POST /api/records/clear     {stage_id} 직접 클리어 → cleared 고정
  POST /api/records/hint      {stage_id} 힌트(AI) 사용 표시
  POST /api/records/reset     현재 사용자의 기록 초기화
"""

import os
import socket
import threading
import time
import webbrowser
from functools import wraps

from flask import Flask, jsonify, render_template, request, session

from tetris import db, pieces, solver, stages

HOST = "127.0.0.1"
PORT = 5000

app = Flask(__name__)
app.config["JSON_AS_ASCII"] = False  # 한글 메시지를 그대로 직렬화
# 세션 서명용 키. 배포 시 환경변수 SECRET_KEY 로 교체한다.
app.secret_key = os.environ.get("SECRET_KEY", "tetris-backtracking-dev-secret")

db.init_db()


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/pieces")
def api_pieces():
    return jsonify(pieces.export_pieces())


@app.route("/api/stages")
def api_stages():
    return jsonify(stages.list_stages())


@app.route("/api/solve", methods=["POST"])
def api_solve():
    """요청 본문(JSON):
        {stage_id, pruning}  또는  {width, height, queue, garbage, pruning}
    """
    data = request.get_json(force=True) or {}
    use_pruning = bool(data.get("pruning", True))

    stage_id = data.get("stage_id")
    if stage_id:
        stage = stages.get_stage(stage_id)
        if stage is None:
            return jsonify({"error": f"알 수 없는 스테이지: {stage_id}"}), 404
        width, height = stage["width"], stage["height"]
        queue, garbage = stage["queue"], stage.get("garbage", [])
    else:
        width = int(data.get("width", 4))
        height = int(data.get("height", 4))
        queue = list(data.get("queue", []))
        garbage = data.get("garbage", [])

    if not queue:
        return jsonify({"error": "블록 큐가 비어 있습니다."}), 400

    result = solver.solve_stage(width, height, queue, garbage, use_pruning)
    return jsonify(result)


# ---------------------------------------------------------------------------
# 계정 / 기록
# ---------------------------------------------------------------------------
def login_required(view):
    """로그인되지 않은 요청은 401 로 막는 데코레이터."""

    @wraps(view)
    def wrapped(*args, **kwargs):
        if not session.get("uid"):
            return jsonify({"error": "로그인이 필요합니다."}), 401
        return view(*args, **kwargs)

    return wrapped


def _valid_stage_id(stage_id):
    return bool(stage_id) and stages.get_stage(stage_id) is not None


@app.route("/api/register", methods=["POST"])
def api_register():
    data = request.get_json(force=True) or {}
    user, err = db.create_user(data.get("username"), data.get("password"))
    if err:
        return jsonify({"error": err}), 400
    session["uid"] = user["id"]
    return jsonify({"user": {"username": user["username"]}})


@app.route("/api/login", methods=["POST"])
def api_login():
    data = request.get_json(force=True) or {}
    user = db.verify_user(data.get("username"), data.get("password"))
    if not user:
        return jsonify({"error": "아이디 또는 비밀번호가 올바르지 않습니다."}), 401
    session["uid"] = user["id"]
    return jsonify({"user": {"username": user["username"]}})


@app.route("/api/logout", methods=["POST"])
def api_logout():
    session.clear()
    return jsonify({"ok": True})


@app.route("/api/me")
def api_me():
    uid = session.get("uid")
    user = db.get_user(uid) if uid else None
    if not user:
        session.clear()
        return jsonify({"user": None})
    return jsonify({"user": {"username": user["username"]}})


@app.route("/api/records")
@login_required
def api_records():
    return jsonify({"records": db.get_records(session["uid"])})


@app.route("/api/records/attempt", methods=["POST"])
@login_required
def api_records_attempt():
    stage_id = (request.get_json(force=True) or {}).get("stage_id")
    if not _valid_stage_id(stage_id):
        return jsonify({"error": "알 수 없는 스테이지"}), 400
    return jsonify({"record": db.add_attempt(session["uid"], stage_id)})


@app.route("/api/records/clear", methods=["POST"])
@login_required
def api_records_clear():
    stage_id = (request.get_json(force=True) or {}).get("stage_id")
    if not _valid_stage_id(stage_id):
        return jsonify({"error": "알 수 없는 스테이지"}), 400
    return jsonify({"record": db.mark_cleared(session["uid"], stage_id)})


@app.route("/api/records/hint", methods=["POST"])
@login_required
def api_records_hint():
    stage_id = (request.get_json(force=True) or {}).get("stage_id")
    if not _valid_stage_id(stage_id):
        return jsonify({"error": "알 수 없는 스테이지"}), 400
    return jsonify({"record": db.mark_hint(session["uid"], stage_id)})


@app.route("/api/records/reset", methods=["POST"])
@login_required
def api_records_reset():
    db.reset_records(session["uid"])
    return jsonify({"ok": True})


def _open_browser_when_ready():
    """서버가 포트를 실제로 열면 기본 브라우저로 접속 페이지를 자동으로 연다.
    (연결 거부를 피하려고 포트가 열릴 때까지 폴링한 뒤 실행) """
    url = f"http://{HOST}:{PORT}/"
    for _ in range(60):  # 최대 약 12초 대기
        try:
            with socket.create_connection((HOST, PORT), timeout=0.4):
                break
        except OSError:
            time.sleep(0.2)
    try:
        webbrowser.open_new(url)
    except Exception:
        pass


if __name__ == "__main__":
    # 교육용 로컬 서버. 디버그 모드로 자동 리로드.
    # 리로더 부모 프로세스에서 한 번만 브라우저 자동 실행을 예약한다.
    # (WERKZEUG_RUN_MAIN 은 리로더가 띄우는 자식 프로세스에만 'true' 로 설정됨)
    # NO_BROWSER=1 환경변수로 자동 실행을 끌 수 있다.
    if os.environ.get("WERKZEUG_RUN_MAIN") != "true" and os.environ.get("NO_BROWSER") != "1":
        threading.Thread(target=_open_browser_when_ready, daemon=True).start()
        print(f" * 브라우저가 자동으로 열립니다 → http://{HOST}:{PORT}/")
    app.run(host=HOST, port=PORT, debug=True)
