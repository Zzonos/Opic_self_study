@echo off
cd /d "%~dp0"
set PYTHONIOENCODING=utf-8
set PYTHONUTF8=1
echo [1/3] checking python...
python --version || (echo python not found. Install Python 3 and check "Add to PATH". & pause & exit /b 1)
echo [2/3] installing packages (edge-tts, requests)...
python -m pip install -q edge-tts requests
echo [3/3] rendering + uploading... (see render_upload.log)
python render_upload.py %* > run.log 2>&1
type run.log
echo.
echo DONE. Press any key to close.
pause >nul
