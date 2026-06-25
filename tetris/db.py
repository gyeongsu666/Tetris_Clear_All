"""사용자 계정 + 스테이지 기록을 보관하는 로컬 SQLite DB.

추후 배포에서도 그대로 쓰도록 표준 라이브러리 ``sqlite3`` 만 사용한다.
비밀번호는 평문으로 저장하지 않고 ``werkzeug.security`` 해시로만 보관한다.

records 테이블은 (user_id, stage_id) 당 한 행이며 의미는 다음과 같다.
  attempts  : 클리어 전까지 시도한 판 수(클리어한 판 포함). 클리어 후에는 고정.
  cleared   : 직접 모드로 퍼펙트 클리어했는지 여부
  hint_used : 해당 스테이지에서 AI 탐색/정답(힌트)을 본 적이 있는지 여부
"""

import os
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone

from werkzeug.security import check_password_hash, generate_password_hash

# 프로젝트 루트(=이 파일의 상위의 상위)에 DB 파일을 둔다.
DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tetris.db")

# 쓰기 직렬화용 락 (스레드 기반 개발 서버에서 'database is locked' 방지)
_write_lock = threading.Lock()


def _connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


@contextmanager
def _db():
    """트랜잭션을 커밋/롤백하고 연결을 확실히 닫는 컨텍스트 매니저."""
    conn = _connect()
    try:
        with conn:  # 정상 종료 시 commit, 예외 시 rollback
            yield conn
    finally:
        conn.close()


def _now():
    return datetime.now(timezone.utc).isoformat()


def init_db():
    """앱 시작 시 1회 호출. 테이블이 없으면 생성한다."""
    with _db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                username      TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at    TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS records (
                user_id    INTEGER NOT NULL,
                stage_id   TEXT NOT NULL,
                attempts   INTEGER NOT NULL DEFAULT 0,
                cleared    INTEGER NOT NULL DEFAULT 0,
                hint_used  INTEGER NOT NULL DEFAULT 0,
                cleared_at TEXT,
                PRIMARY KEY (user_id, stage_id)
            );
            """
        )


# ----------------------------------------------------------------------------
# 사용자(계정)
# ----------------------------------------------------------------------------
def create_user(username, password):
    """회원가입. 성공하면 (user_dict, None), 실패하면 (None, 오류메시지)."""
    username = (username or "").strip()
    if not username or not password:
        return None, "아이디와 비밀번호를 모두 입력하세요."
    if len(username) > 20:
        return None, "아이디는 20자 이하로 입력하세요."

    with _write_lock, _db() as conn:
        exists = conn.execute(
            "SELECT 1 FROM users WHERE username = ?", (username,)
        ).fetchone()
        if exists:
            return None, "이미 존재하는 아이디입니다."
        cur = conn.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), _now()),
        )
        return {"id": cur.lastrowid, "username": username}, None


def verify_user(username, password):
    """로그인 검증. 성공하면 user_dict, 실패하면 None."""
    username = (username or "").strip()
    with _db() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE username = ?", (username,)
        ).fetchone()
    if row and check_password_hash(row["password_hash"], password or ""):
        return {"id": row["id"], "username": row["username"]}
    return None


def get_user(user_id):
    with _db() as conn:
        row = conn.execute(
            "SELECT id, username FROM users WHERE id = ?", (user_id,)
        ).fetchone()
    return {"id": row["id"], "username": row["username"]} if row else None


# ----------------------------------------------------------------------------
# 기록(records)
# ----------------------------------------------------------------------------
def _record_dict(row):
    return {
        "attempts": row["attempts"],
        "cleared": bool(row["cleared"]),
        "hint_used": bool(row["hint_used"]),
        "cleared_at": row["cleared_at"],
    }


def get_records(user_id):
    """{stage_id: {attempts, cleared, hint_used, cleared_at}} 형태로 반환."""
    with _db() as conn:
        rows = conn.execute(
            "SELECT stage_id, attempts, cleared, hint_used, cleared_at "
            "FROM records WHERE user_id = ?",
            (user_id,),
        ).fetchall()
    return {r["stage_id"]: _record_dict(r) for r in rows}


def _ensure_row(conn, user_id, stage_id):
    conn.execute(
        "INSERT OR IGNORE INTO records (user_id, stage_id) VALUES (?, ?)",
        (user_id, stage_id),
    )


def _fetch_row(conn, user_id, stage_id):
    return conn.execute(
        "SELECT * FROM records WHERE user_id = ? AND stage_id = ?",
        (user_id, stage_id),
    ).fetchone()


def add_attempt(user_id, stage_id):
    """새 한 판이 시작될 때 호출. 아직 클리어 전이면 시도 +1, 클리어 후면 고정."""
    with _write_lock, _db() as conn:
        _ensure_row(conn, user_id, stage_id)
        row = _fetch_row(conn, user_id, stage_id)
        if not row["cleared"]:
            conn.execute(
                "UPDATE records SET attempts = attempts + 1 "
                "WHERE user_id = ? AND stage_id = ?",
                (user_id, stage_id),
            )
            row = _fetch_row(conn, user_id, stage_id)
        return _record_dict(row)


def mark_cleared(user_id, stage_id):
    """직접 모드 퍼펙트 클리어. 최초 1회만 cleared/시각을 고정한다.

    (클리어한 판의 시도 +1 은 판 시작 시 add_attempt 로 이미 반영되어 있다.)
    """
    with _write_lock, _db() as conn:
        _ensure_row(conn, user_id, stage_id)
        row = _fetch_row(conn, user_id, stage_id)
        if not row["cleared"]:
            conn.execute(
                "UPDATE records SET cleared = 1, cleared_at = ? "
                "WHERE user_id = ? AND stage_id = ?",
                (_now(), user_id, stage_id),
            )
            row = _fetch_row(conn, user_id, stage_id)
        return _record_dict(row)


def mark_hint(user_id, stage_id):
    """해당 스테이지에서 AI 탐색/정답(힌트)을 본 순간 호출."""
    with _write_lock, _db() as conn:
        _ensure_row(conn, user_id, stage_id)
        conn.execute(
            "UPDATE records SET hint_used = 1 WHERE user_id = ? AND stage_id = ?",
            (user_id, stage_id),
        )
        return _record_dict(_fetch_row(conn, user_id, stage_id))


def reset_records(user_id):
    """해당 사용자의 모든 기록 삭제."""
    with _write_lock, _db() as conn:
        conn.execute("DELETE FROM records WHERE user_id = ?", (user_id,))
