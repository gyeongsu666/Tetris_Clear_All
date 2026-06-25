from tetris import solver, engine


def full_rows_minus(width, rows, gap):
    """rows(행 인덱스 목록)를 가득 채우되 gap(=(r,c) 집합)만 비운 가비지 좌표."""
    g = []
    gap = set(map(tuple, gap))
    for r in rows:
        for c in range(width):
            if (r, c) not in gap:
                g.append([r, c])
    return g


def show(width, height, garbage, solution):
    b = engine.make_board(height, width, garbage)
    # 실제 클리어를 적용하며 재생 → 최종은 비어야 함
    for step in solution:
        for r, c in step["cells"]:
            b[r][c] = step["order"]
        b, _ = engine.clear_lines(b)
    return engine.is_empty(b)


CANDS = []
# 스태킹형(가비지 없음): 바닥 K줄을 채워 비우기
CANDS += [
    ("tut   W4H6 OO",      4, 6, ["O", "O"], []),
    ("sq    W4H7 OOOO",    4, 7, ["O", "O", "O", "O"], []),
    ("iljo  W4H7 ILJO",    4, 7, ["I", "L", "J", "O"], []),
    ("lljj  W4H7 LLJJ",    4, 7, ["L", "L", "J", "J"], []),
    ("tttt  W4H7 TTTT",    4, 7, ["T", "T", "T", "T"], []),
    ("adv6  W6H7 OLJOLJ",  6, 7, ["O", "L", "J", "O", "L", "J"], []),
    ("jloi  W4H7 JLOI",    4, 7, ["J", "L", "O", "I"], []),
]
# 가비지-갭형: 바닥 가비지의 빈틈을 블록으로 메워 줄 제거
CANDS += [
    ("g-O   W4H6 gapO",    4, 6, ["O"],
     full_rows_minus(4, [4, 5], [(4, 0), (4, 1), (5, 0), (5, 1)])),
    ("g-OO  W6H7 gap2O",   6, 7, ["O", "O"],
     full_rows_minus(6, [5, 6], [(5, 0), (5, 1), (6, 0), (6, 1), (5, 2), (5, 3), (6, 2), (6, 3)])),
    ("g-LJ  W4H7 gapLJ",   4, 7, ["L", "J"],
     full_rows_minus(4, [5, 6], [(5, 0), (5, 1), (5, 2), (5, 3), (6, 0), (6, 1), (6, 2), (6, 3)])),
    ("g-T   W6H7 gapT",    6, 7, ["T", "T"],
     full_rows_minus(6, [5, 6], [(5, 1), (5, 2), (5, 3), (5, 4), (6, 1), (6, 2), (6, 3), (6, 4)])),
]


def main():
    for name, w, h, q, g in CANDS:
        on = solver.solve_stage(w, h, q, g, True)
        off = solver.solve_stage(w, h, q, g, False)
        ok = on["solved"]
        replay_ok = show(w, h, g, on["solution"]) if ok else False
        print(f"{name:18s} solved={str(ok):5s} replay_empty={str(replay_ok):5s} "
              f"area={on['area_ok']} | ON nodes={on['stats']['nodes']:5d} bt={on['stats']['backtracks']:4d} "
              f"pr={on['stats']['prunes']:4d} ev={on['stats']['events']:5d} "
              f"| OFF nodes={off['stats']['nodes']:5d} ev={off['stats']['events']:5d}")


if __name__ == "__main__":
    main()
