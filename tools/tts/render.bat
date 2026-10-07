@echo off
cd /d %~dp0
python -m pip install --quiet edge-tts || (echo Python이 필요합니다: https://www.python.org/downloads/ 에서 설치 시 "Add python.exe to PATH" 체크 & pause & exit /b 1)
python edge_render.py
pause
