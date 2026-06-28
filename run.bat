@echo off
REM ============================================================
REM  Logo Showcase - run from source (needs Python installed).
REM  Most teammates should use LogoShowcase.exe instead; this is
REM  a fallback for machines that already have Python.
REM ============================================================
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo Python was not found. Install it from https://www.python.org/downloads/
  echo or just use LogoShowcase.exe ^(no Python needed^).
  pause
  exit /b 1
)

if not exist ".venv" (
  echo Setting up for first run...
  python -m venv .venv
  call ".venv\Scripts\activate.bat"
  pip install -r requirements.txt
) else (
  call ".venv\Scripts\activate.bat"
)

echo Starting Logo Showcase...
python run_app.py
pause
