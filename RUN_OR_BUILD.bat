@echo off
cd /d "%~dp0"
echo =====================================================
echo   CXI SLT Toolkit — Setup and Launch
echo =====================================================
echo.
echo [1/2] Installing dependencies (first run only)...
call npm install
echo.
echo [2/2] Launching CXI SLT...
call npm start
