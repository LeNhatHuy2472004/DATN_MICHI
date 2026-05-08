@echo off
REM ============================================================
REM crawData.bat — Generate fashion product data and import via API
REM (See doc/CRAWL_DATA_PLAN.md for source policy + schema)
REM
REM Usage:
REM   crawData.bat                  -> 30 products, default category mix
REM   crawData.bat 50               -> 50 products
REM   crawData.bat 30 -DryRun       -> show plan, don't hit API
REM   crawData.bat 30 -Verbose      -> show every API call
REM ============================================================
setlocal
set "ROOT=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\crawData.ps1" %*
endlocal
