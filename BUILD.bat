@echo off
cd /d "%~dp0"
title CXI SLT Toolkit - Builder
color 0B
echo.
echo  ========================================
echo    CXI SLT Toolkit - Build Script
echo  ========================================
echo.

:: Check for Administrator privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo  [WARNING] You are NOT running as Administrator.
    echo  The build might fail when creating symbolic links on Windows.
    echo  If the build fails with "A required privilege is not held by the client",
    echo  please right-click this file and select "Run as administrator".
    echo.
)

:: Check Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Node.js not found!
    echo  Please install Node.js from https://nodejs.org
    echo  Recommended: LTS version 18 or higher
    pause
    exit /b 1
)

echo  [OK] Node.js found: 
node --version

echo.
echo  [1/4] Installing dependencies...
call npm install
if %errorlevel% neq 0 (
    echo  [ERROR] npm install failed!
    pause
    exit /b 1
)

echo.
echo  [2/4] Dependencies installed successfully!
echo.
echo  Choose build type:
echo  [1] Build installer (.exe setup file)  - RECOMMENDED
echo  [2] Build portable (.exe single file)
echo  [3] Run in development mode (no build)
echo.
set /p choice="Enter choice (1/2/3): "

if "%choice%"=="3" (
    echo.
    echo  [DEV] Launching CXI SLT in dev mode...
    call npm start
    goto end
)

echo.
echo  [3/4] Building application...
if "%choice%"=="2" (
    call npm run build-portable
) else (
    call npm run build
)

if %errorlevel% neq 0 (
    echo  [ERROR] Build failed! Check output above.
    pause
    exit /b 1
)

echo.
echo  [4/4] BUILD COMPLETE!
echo.
echo  Output files are in the "dist\" folder:
echo   - CXI SLT Toolkit Setup.exe  (installer)
echo   - CXI SLT Toolkit.exe        (portable)
echo.
echo  ========================================
echo    Ready to use! Run the .exe file.
echo  ========================================

:end
echo.
pause
