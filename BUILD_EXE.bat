@echo off
cd /d "%~dp0"
echo =====================================================
echo   CXI SLT Toolkit — Build Windows .exe
echo =====================================================
echo.
:: Check for Administrator privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [WARNING] Not running as Administrator.
    echo If the build fails with "A required privilege is not held by the client",
    echo please right-click this file and select "Run as administrator".
    echo.
)

echo [1/2] Installing dependencies...
call npm install
echo.
echo [2/2] Building Windows installer (.exe)...
call npm run build
echo.
echo =====================================================
echo Done! Check the "dist" folder for your .exe files.
echo =====================================================
pause
