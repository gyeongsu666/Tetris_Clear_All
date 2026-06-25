"""테트리스 물리 엔진.

보드판은 2차원 리스트(board[row][col])로 표현한다.
  - 값 0      : 빈 칸
  - 값 N(>=1) : N 번째로 낙하·안착한 블록 (시각적 순서 번호 각인)

row 0 이 화면 최상단, row H-1 이 바닥. 중력은 row 가 커지는 방향.
"""

from collections import deque


def make_board(height, width, garbage=None):
    """빈 보드를 생성한다. garbage 가 주어지면 채워진 칸(값 -1)으로 초기화."""
    board = [[0] * width for _ in range(height)]
    if garbage:
        for r, c in garbage:
            board[r][c] = -1  # 미리 깔린 장애물(가비지)
    return board


def clone(board):
    return [row[:] for row in board]


def dims(cells):
    """정규화된 셀 묶음의 (높이, 너비)."""
    h = max(r for r, _ in cells) + 1
    w = max(c for _, c in cells) + 1
    return h, w


def drop_row(board, cells, col):
    """블록(cells, 정규화됨)을 col 위치에서 위→아래로 떨어뜨렸을 때
    안착하는 최상단 행 r0 을 반환한다. 놓을 수 없으면 None.

    실제 테트리스처럼 '위에서 직선 낙하' 하며, 먼저 충돌하는 지점에서 멈춘다
    (오버행/돌출부 아래로는 통과하지 못함).
    """
    H = len(board)
    W = len(board[0])
    h, w = dims(cells)
    if col < 0 or col + w > W:
        return None

    best = None
    for r0 in range(0, H - h + 1):
        fits = all(board[r0 + r][col + c] == 0 for r, c in cells)
        if fits:
            best = r0  # 더 내려갈 수 있는지 계속 확인
        else:
            break  # 충돌 -> 직선 낙하는 여기서 멈춤
    return best


def place(board, cells, r0, col, order):
    """블록을 (r0, col) 기준으로 안착시킨 새 보드를 반환. 안착 칸에 order 각인."""
    nb = clone(board)
    for r, c in cells:
        nb[r0 + r][col + c] = order
    return nb


def clear_lines(board):
    """가득 찬 줄을 제거하고, 위 칸들을 아래로 내린 새 보드를 반환한다.

    반환: (새 보드, 제거된 행 인덱스 리스트)
    """
    H = len(board)
    W = len(board[0])
    full_rows = [i for i in range(H) if all(v != 0 for v in board[i])]
    if not full_rows:
        return board, []
    kept = [board[i] for i in range(H) if i not in set(full_rows)]
    new_board = [[0] * W for _ in range(len(full_rows))] + kept
    return new_board, full_rows


def count_filled(board):
    return sum(1 for row in board for v in row if v != 0)


def is_empty(board):
    return all(v == 0 for row in board for v in row)


def is_full(board):
    """빈 칸(0)이 하나도 없으면 True. (보드를 가득 채움 = 모든 줄이 가득 참)"""
    return all(v != 0 for row in board for v in row)


def empty_regions(board):
    """빈 칸들을 4방향 연결요소(영역)로 분할하여 각 영역의 셀 목록을 반환.

    플러드 필(BFS) 기반. 가지치기 휴리스틱에서 사용한다.
    """
    H = len(board)
    W = len(board[0])
    seen = [[False] * W for _ in range(H)]
    regions = []
    for r in range(H):
        for c in range(W):
            if board[r][c] == 0 and not seen[r][c]:
                q = deque([(r, c)])
                seen[r][c] = True
                cells = []
                while q:
                    cr, cc = q.popleft()
                    cells.append((cr, cc))
                    for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        nr, nc = cr + dr, cc + dc
                        if 0 <= nr < H and 0 <= nc < W and board[nr][nc] == 0 and not seen[nr][nc]:
                            seen[nr][nc] = True
                            q.append((nr, nc))
                regions.append(cells)
    return regions


def reachable_from_top(board):
    """최상단(row 0)의 열린 칸에서 빈 칸을 따라 도달 가능한 칸을 표시한 격자 반환.

    여기에 포함되지 않는 빈 칸 = 위가 막혀 낙하로는 채울 수 없는 '봉인된 구멍'.
    """
    H = len(board)
    W = len(board[0])
    reach = [[False] * W for _ in range(H)]
    q = deque()
    for c in range(W):
        if board[0][c] == 0:
            reach[0][c] = True
            q.append((0, c))
    while q:
        r, c = q.popleft()
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nr, nc = r + dr, c + dc
            if 0 <= nr < H and 0 <= nc < W and board[nr][nc] == 0 and not reach[nr][nc]:
                reach[nr][nc] = True
                q.append((nr, nc))
    return reach
