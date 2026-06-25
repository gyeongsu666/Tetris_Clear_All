"""테트로미노(블록) 정의 모듈.

각 블록을 회전 0도 기준의 셀 좌표 집합으로 정의하고,
시계 방향 90도 회전을 반복 적용하여 고유한 회전 상태들을 생성한다.
(중복 회전은 제거 -> 탐색 공간 축소 = 1차 최적화)

좌표계: (row, col), row 가 아래로 증가(중력 방향), col 은 오른쪽으로 증가.
"""

# 회전 0도 기준 4칸 좌표. 정규화(좌상단을 (0,0)에 맞춤)는 _normalize 가 처리.
BASE_SHAPES = {
    "I": [(0, 0), (0, 1), (0, 2), (0, 3)],
    "O": [(0, 0), (0, 1), (1, 0), (1, 1)],
    "T": [(0, 0), (0, 1), (0, 2), (1, 1)],
    "S": [(0, 1), (0, 2), (1, 0), (1, 1)],
    "Z": [(0, 0), (0, 1), (1, 1), (1, 2)],
    "J": [(0, 0), (1, 0), (1, 1), (1, 2)],
    "L": [(0, 2), (1, 0), (1, 1), (1, 2)],
}

# 블록별 표시 색상(프론트엔드와 공유). 가독성 좋은 파스텔 계열.
COLORS = {
    "I": "#22d3ee",  # cyan
    "O": "#facc15",  # yellow
    "T": "#c084fc",  # purple
    "S": "#4ade80",  # green
    "Z": "#f87171",  # red(연)
    "J": "#60a5fa",  # blue
    "L": "#fb923c",  # orange
}


def _normalize(cells):
    """좌표 집합을 좌상단이 (0,0)에 닿도록 평행 이동하고 정렬한다."""
    min_r = min(r for r, _ in cells)
    min_c = min(c for _, c in cells)
    return tuple(sorted((r - min_r, c - min_c) for r, c in cells))


def _rotate_cw(cells):
    """시계 방향 90도 회전 후 정규화.  (r, c) -> (c, -r)."""
    return _normalize([(c, -r) for r, c in cells])


def get_rotations(piece):
    """블록의 고유한 회전 상태 목록을 반환한다.

    O=1개, I/S/Z=2개, T/J/L=4개 의 고유 회전이 생성된다.
    """
    rotations = []
    cur = _normalize(BASE_SHAPES[piece])
    for _ in range(4):
        if cur not in rotations:
            rotations.append(cur)
        cur = _rotate_cw(cur)
    return rotations


# 미리 계산해 캐싱(리스트 of 리스트 형태로 직렬화하기 쉽게 보관).
ROTATIONS = {p: [[list(c) for c in rot] for rot in get_rotations(p)] for p in BASE_SHAPES}


def export_pieces():
    """프론트엔드로 내려보낼 블록 메타데이터(JSON 직렬화 가능)."""
    return {
        p: {"color": COLORS[p], "rotations": ROTATIONS[p]}
        for p in BASE_SHAPES
    }
