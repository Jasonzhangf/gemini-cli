@echo off
echo ====================================
echo Building Gemini CLI for Windows...
echo ====================================

echo.
echo [1/3] Building project...
call npm run build
if %errorlevel% neq 0 (
    echo ERROR: Build failed!
    pause
    exit /b 1
)

echo.
echo [2/3] Creating bundle...
call npm run bundle
if %errorlevel% neq 0 (
    echo ERROR: Bundle creation failed!
    pause
    exit /b 1
)

echo.
echo [3/3] Installing globally...
call npm install -g .
if %errorlevel% neq 0 (
    echo ERROR: Global installation failed!
    pause
    exit /b 1
)

echo.
echo ====================================
echo SUCCESS! Gemini CLI updated successfully!
echo ====================================
echo.
echo You can now use 'gemini' command in any directory.
echo The timeout has been increased to 5 minutes.
echo.
pause