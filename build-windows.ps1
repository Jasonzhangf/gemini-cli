# PowerShell script for building and installing Gemini CLI on Windows
Write-Host "====================================" -ForegroundColor Cyan
Write-Host "Building Gemini CLI for Windows..." -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan

Write-Host ""
Write-Host "[1/3] Building project..." -ForegroundColor Yellow
& npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Build failed!" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "[2/3] Creating bundle..." -ForegroundColor Yellow
& npm run bundle
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Bundle creation failed!" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "[3/3] Installing globally..." -ForegroundColor Yellow
& npm install -g .
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Global installation failed!" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "====================================" -ForegroundColor Green
Write-Host "SUCCESS! Gemini CLI updated successfully!" -ForegroundColor Green
Write-Host "====================================" -ForegroundColor Green
Write-Host ""
Write-Host "You can now use 'gemini' command in any directory." -ForegroundColor White
Write-Host "The timeout has been increased to 5 minutes." -ForegroundColor White
Write-Host ""
Read-Host "Press Enter to exit"