@echo off
setlocal EnableExtensions
chcp 65001 >nul

REM ============================================================
REM crawData.bat - Crawl/import s?n ph?m th?i trang MiiChin
REM Y?u c?u: d? li?u ??y ??, ?nh kh?p t?n/m?u, kh?ng import thi?u ?nh
REM Usage:
REM   crawData.bat
REM   crawData.bat 30
REM   crawData.bat 30 -DryRun
REM   crawData.bat 30 -Verbose
REM ============================================================

set "ROOT=%~dp0"
set "SCRIPT=%ROOT%scripts\crawData.ps1"

echo.
echo ============================================================
echo  MiiChin - Crawl Data Import
echo ============================================================
echo  Root   : %ROOT%
echo  Script : %SCRIPT%
echo.

if not exist "%SCRIPT%" (
  echo [FAIL] Khong tim thay file PowerShell: %SCRIPT%
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" %*
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if "%EXIT_CODE%"=="0" (
  echo [DONE] CrawData hoan tat.
) else (
  echo [FAIL] CrawData that bai voi ma loi %EXIT_CODE%.
)

endlocal & exit /b %EXIT_CODE%

