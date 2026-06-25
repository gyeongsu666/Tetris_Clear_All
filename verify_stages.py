"""스테이지 검증 스크립트.

stages.py 에 정의된 모든 스테이지에 대해 다음을 확인한다.
  1. 면적 정합성  : 가비지 + 4*블록수 == 너비*높이
  2. 풀이 가능성  : 해가 있어야 하는 스테이지는 solved=True
  3. 가지치기 안전: 가지치기 ON 노드수 <= OFF 노드수
                    (정답 경로를 잘라내지 않음 = safe)
  4. 정답 보드 출력
"""
from tetris import solver, stages, engine


def render(board):
    rows = []
    for row in board:
        rows.append("".join("." if v == 0 else ("#" if v == -1 else str(v % 10)) for v in row))
    return rows


def replay_empty(width, height, garbage, solution):
    """정답 배치를 실제 줄 제거를 적용하며 재생 → 최종 보드가 비면 True."""
    board = engine.make_board(height, width, garbage)
    for step in solution:
        for r, c in step["cells"]:
            board[r][c] = step["order"]
        board, _ = engine.clear_lines(board)
    return engine.is_empty(board)


def main():
    print(f"{'스테이지':26s} 면적  풀이  재생  안전   ON노드  OFF노드  이벤트")
    print("-" * 76)
    all_ok = True
    for s in stages.STAGES:
        w, h, q, g = s["width"], s["height"], s["queue"], s.get("garbage", [])
        area_ok = (len(g) + 4 * len(q)) % w == 0
        on = solver.solve_stage(w, h, q, g, True)
        off = solver.solve_stage(w, h, q, g, False)
        expect_solvable = s["id"] != "no-solution"
        solve_ok = (on["solved"] == expect_solvable)
        replay_ok = replay_empty(w, h, g, on["solution"]) if on["solved"] else (not expect_solvable)
        safe = on["stats"]["nodes"] <= off["stats"]["nodes"]
        ok = area_ok and solve_ok and replay_ok and safe
        all_ok = all_ok and ok
        flag = "OK " if ok else "!! "
        print(f"{flag}{s['id']:22s} {str(area_ok):5s} {str(on['solved']):5s} "
              f"{str(replay_ok):5s} {str(safe):5s} {on['stats']['nodes']:7d}"
              f"{off['stats']['nodes']:8d}{on['stats']['events']:8d}")
    print("-" * 76)
    print("전체 검증 통과" if all_ok else "검증 실패 항목 있음")
    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
