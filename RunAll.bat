@echo off
setlocal
set ROOT=%~dp0
echo === Michi: starting Backend + Frontend ===

REM ===== Environment preflight =====
REM Checks required tools and installs missing ones before starting the app:
REM - .NET SDK 8 for backend
REM - Node.js LTS + npm for frontend
REM - SQL Server LocalDB for the (localdb)\MSSQLLocalDB connection string
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\EnsureEnvironment.ps1"
set "PREFLIGHT_EXIT=%ERRORLEVEL%"
if not "%PREFLIGHT_EXIT%"=="0" (
  echo.
  echo [ERROR] Environment preflight failed. If an installer needs permission, run RunAll.bat as Administrator.
  pause
  exit /b %PREFLIGHT_EXIT%
)

REM Stop old app instances first so repeated runs do not fail with "address already in use".
echo [CHECK] Stopping existing services on ports 5000 and 5173 ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ports = @(5000, 5173); foreach ($port in $ports) { $processIds = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; foreach ($processId in $processIds) { if ($processId -gt 0) { $process = Get-Process -Id $processId -ErrorAction SilentlyContinue; if ($process) { Write-Host ('[STOP] Port {0}: killing PID {1} ({2})' -f $port, $processId, $process.ProcessName); Stop-Process -Id $processId -Force } } } }"
timeout /t 1 /nobreak >nul

REM ===== Backend =====
start "Michi-BE" cmd /k "cd /d %ROOT%backend && (if not exist bin dotnet restore) && echo [BE] Starting on http://localhost:5000 ... && dotnet run --urls=http://localhost:5000"

REM Wait for BE to bind port before starting FE
timeout /t 4 /nobreak >nul

REM ===== Frontend =====
REM Use `call npm` because npm is npm.cmd on Windows; without `call` the shell exits after npm.
REM Parenthesise the `if` block so the && chain still runs when node_modules already exists.
start "Michi-FE" cmd /k "cd /d %ROOT%frontend && (if not exist node_modules call npm install) && echo [FE] Starting Vite on http://localhost:5173 ... && call npm run dev -- --host 127.0.0.1 --port 5173"

echo.
echo Backend:  http://localhost:5000   (Swagger: /swagger)
echo Frontend: http://localhost:5173
echo Stop:     close the two console windows (Michi-BE / Michi-FE)
endlocal
