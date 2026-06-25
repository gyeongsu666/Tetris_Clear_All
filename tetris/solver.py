"""큐 순서 기반 백트래킹 솔버 + 가지치기 + 탐색 히스토리 로그.

[탐색 모델 — 실제 라인 클리어 퍼펙트 클리어]
고정된 순서의 블록을 위에서 떨어뜨려 안착시키고, 가로 한 줄이 가득 차면
그 줄을 즉시 제거(line clear)한다. 모든 블록을 사용한 뒤 보드가 완전히
비워지면(Perfect Clear) 성공이다. 보드를 끝까지 채울 필요는 없고,
'줄이 차면 사라져' 결국 모두 없애기만 하면 된다.

[가지치기 — 안전(정답 경로를 잘라내지 않음)]
  divisibility : 앞으로 사라질 칸 수는 줄 단위(=너비 W)로만 줄어든다.
                 따라서 (현재 채워진 칸 + 4*남은블록) 이 W 로 나눠떨어지지
                 않으면 절대 다 비울 수 없으므로 즉시 역추적. (항상 안전)
  sealed       : 위가 막혀 어떤 낙하로도 채울 수 없는 '봉인된 빈 칸'이 생기면,
                 그 칸이 포함된 바닥 줄은 영영 채워지지 않아 사라질 수 없다.
                 플러드 필(BFS) 도달성 검사로 찾아 즉시 역추적.

[히스토리 이벤트 type]
  try       : N번째 블록을 어떤 열/회전으로 안착시켜 보는 시도
  clear     : 가득 찬 줄 제거 발생
  prune     : 가지치기로 더 내려가지 않고 즉시 되돌아감
  backtrack : 막다른 길에서 블록을 회수하며 되돌아감
  solution  : 모든 블록 사용 후 보드가 완전히 비워짐(Perfect Clear)
"""

from . import engine, pieces

MAX_EVENTS = 60000
MAX_NODES = 400000


class _Aborted(Exception):
    """탐색 상한 초과 신호."""


class Solver:
    def __init__(self, width, height, queue, garbage=None, use_pruning=True):
        self.W = width
        self.H = height
        self.queue = list(queue)
        self.garbage = garbage or []
        self.use_pruning = use_pruning

        self.history = []
        self.solution = None
        self.nodes = 0
        self.backtracks = 0
        self.prunes = 0
        self.aborted = False

        self._rot = {p: pieces.get_rotations(p) for p in set(self.queue)}

    # ------------------------------------------------------------------ #
    def _emit(self, ev_type, board, **kw):
        if len(self.history) >= MAX_EVENTS:
            self.aborted = True
            raise _Aborted()
        ev = {
            "type": ev_type,
            "board": engine.clone(board),
            "nodes": self.nodes,
            "backtracks": self.backtracks,
            "prunes": self.prunes,
        }
        ev.update(kw)
        self.history.append(ev)

    # ------------------------------------------------------------------ #
    def _prune_reason(self, board, remaining):
        filled = engine.count_filled(board)

        # (1) 나눗셈 조건 (항상 안전)
        if (filled + 4 * remaining) % self.W != 0:
            return ("divisibility",
                    f"채운칸 {filled} + 남은블록 {remaining}×4 = {filled + 4 * remaining} 가 "
                    f"너비 {self.W} 로 나눠떨어지지 않아 완전 제거 불가")

        # (2) 봉인된 빈 칸 (낙하로 도달 불가)
        reach = engine.reachable_from_top(board)
        for r in range(self.H):
            for c in range(self.W):
                if board[r][c] == 0 and not reach[r][c]:
                    return ("sealed", f"({r},{c}) 칸이 위로 막혀 채울 수 없음(봉인된 구멍)")
        return None

    # ------------------------------------------------------------------ #
    def _solve(self, board, idx, path):
        if idx == len(self.queue):
            if engine.is_empty(board):
                self.solution = list(path)
                self._emit("solution", board,
                           msg="모든 블록을 사용해 보드를 완전히 비웠습니다 — Perfect Clear!")
                return True
            return False

        if self.nodes >= MAX_NODES:
            self.aborted = True
            raise _Aborted()

        piece = self.queue[idx]
        order = idx + 1
        remaining_after = len(self.queue) - (idx + 1)

        for ri, cells in enumerate(self._rot[piece]):
            _, w = engine.dims(cells)
            for col in range(0, self.W - w + 1):
                r0 = engine.drop_row(board, cells, col)
                if r0 is None:
                    continue

                self.nodes += 1
                placed = engine.place(board, cells, r0, col, order)
                abs_cells = [[r0 + r, col + c] for r, c in cells]
                self._emit(
                    "try", placed,
                    piece=piece, rotation=ri, col=col, row=r0,
                    order=order, depth=idx, active=abs_cells,
                    msg=f"{order}번 블록 [{piece}] 을 {col}열 · {ri * 90}° 로 낙하 시도",
                )

                after, cleared = engine.clear_lines(placed)

                # 가지치기(클리어 반영된 상태 기준)
                if self.use_pruning:
                    pr = self._prune_reason(after, remaining_after)
                    if pr:
                        reason, detail = pr
                        self.prunes += 1
                        self._emit(
                            "prune", after,
                            piece=piece, order=order, depth=idx,
                            reason=reason, msg=f"가지치기: {detail} → 되돌아감",
                        )
                        continue

                if cleared:
                    self._emit(
                        "clear", after,
                        piece=piece, order=order, depth=idx, cleared_rows=cleared,
                        msg=f"가득 찬 {len(cleared)}줄 제거!",
                    )

                path.append({
                    "piece": piece, "rotation": ri, "col": col, "row": r0,
                    "order": order, "cells": abs_cells,
                })
                if self._solve(after, idx + 1, path):
                    return True
                path.pop()

                self.backtracks += 1
                self._emit(
                    "backtrack", placed,
                    piece=piece, order=order, depth=idx, active=abs_cells,
                    msg=f"막다른 길 — {order}번 블록 [{piece}] 회수 후 되돌아감",
                )

        return False

    # ------------------------------------------------------------------ #
    def run(self):
        total = len(self.garbage) + 4 * len(self.queue)
        # 필요조건: 사라질 전체 칸 수가 너비 W 의 배수여야 함
        area_ok = (total % self.W == 0) and total > 0

        board = engine.make_board(self.H, self.W, self.garbage)
        solved = False
        try:
            if area_ok:
                solved = self._solve(board, 0, [])
        except _Aborted:
            solved = False

        return {
            "solved": solved,
            "aborted": self.aborted,
            "area_ok": area_ok,
            "width": self.W,
            "height": self.H,
            "queue": self.queue,
            "garbage": self.garbage,
            "history": self.history,
            "solution": self.solution,
            "stats": {
                "nodes": self.nodes,
                "backtracks": self.backtracks,
                "prunes": self.prunes,
                "events": len(self.history),
            },
        }


def solve_stage(width, height, queue, garbage=None, use_pruning=True):
    return Solver(width, height, queue, garbage, use_pruning).run()
