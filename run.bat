@echo off
chcp 65001 >nul
echo ============================================
echo  테트리스 백트래킹 시각화 서버 시작
echo  잠시 후 브라우저가 자동으로 열립니다.
echo  (안 열리면 http://127.0.0.1:5000 직접 접속)
echo  종료하려면 이 창에서 Ctrl+C
echo ============================================
python -m pip install -r requirements.txt
python app.py
pause
