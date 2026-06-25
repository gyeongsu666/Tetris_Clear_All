"""테트리스 백트래킹 시각화 - 백엔드 핵심 패키지.

구성 모듈
  pieces  : 7종 테트로미노 정의 및 회전 상태 생성
  engine  : 보드판(2D Grid) 물리 낙하/줄 제거/플러드 필 엔진
  solver  : 큐 순서 기반 백트래킹 + 가지치기 + 탐색 히스토리 로그
  stages  : 스테이지(퍼즐) 정의
"""

from . import pieces, engine, solver, stages  # noqa: F401
