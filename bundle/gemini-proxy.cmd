@echo off
set DIR=%~dp0
node "%DIR%gemini-proxy-runner.cjs" %*
