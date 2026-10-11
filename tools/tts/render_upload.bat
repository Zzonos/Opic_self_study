@echo off
cd /d "%~dp0"
echo [1/2] 필요한 패키지 확인...
pip install -q edge-tts requests
echo [2/2] 녹음 + 계정 업로드 시작 (문장당 2~4초)...
python render_upload.py %*
echo.
echo 끝났습니다. 이 창을 닫아도 됩니다.
pause
