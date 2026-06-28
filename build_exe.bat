@echo off
REM ============================================================
REM  Build LogoShowcase.exe on a Windows machine.
REM  Result: dist\LogoShowcase.exe  (share this one file)
REM  You usually don't need this - the GitHub Action builds it
REM  for you. Use this only to build locally.
REM ============================================================
cd /d "%~dp0"

python -m pip install --upgrade pip
pip install -r requirements.txt pyinstaller
pyinstaller LogoShowcase.spec

echo.
echo Done. Your app is at:  dist\LogoShowcase.exe
pause
