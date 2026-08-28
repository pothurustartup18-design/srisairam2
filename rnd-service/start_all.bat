@echo off
title School ERP Startup Manager

echo ===================================================
echo   Stopping any previously running instances...
echo ===================================================
:: Kills the exact windows/processes this script itself starts below, by the
:: same window titles used in the `start "Title" ...` calls further down.
:: This makes re-running this script idempotent: running it a second time
:: (without closing the old windows first) no longer stacks a second set of
:: server/worker/vite processes on top of the running ones -- which is what
:: was repeatedly causing "app slow / not loading / DB not connecting" this
:: session. /T kills each window's whole process tree (cmd.exe + its child
:: node.exe), so both the terminal window and the process inside it go away.
taskkill /IM redis-server.exe /F >nul 2>&1
taskkill /IM ngrok.exe /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Redis Server" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Ngrok Tunnel" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Backend API" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Background Worker" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Frontend UI" /T /F >nul 2>&1
timeout /t 2 /nobreak >nul

echo ===================================================
echo   Starting School ERP and WhatsApp Services
echo ===================================================

:: 1. Start Redis Server
echo [1/5] Starting Redis Server in a new window...
start "Redis Server" /D "%~dp0" cmd /k ".\redis_win\redis-server.exe .\redis_win\redis.windows.conf"

:: Wait 2 seconds for Redis to initialize
timeout /t 2 /nobreak >nul

:: 2. Start Ngrok Tunnel
echo [2/5] Starting Ngrok Tunnel in a new window...
start "Ngrok Tunnel" /D "%~dp0" cmd /k "npx ngrok http 5000 --url stimulate-prize-unwanted.ngrok-free.dev"

:: 3. Start Backend Node Server
echo [3/5] Starting Backend Node API...
start "Backend API" /D "%~dp0" cmd /k "npm run dev"

:: 4. Start Background Worker
echo [4/5] Starting Background Worker...
start "Background Worker" /D "%~dp0" cmd /k "npm run dev:worker"

:: 5. Start Frontend React Server
echo [5/5] Starting Frontend React UI...
start "Frontend UI" /D "%~dp0..\rnd-ui" cmd /k "npm run dev"

:: Detect this machine's current LAN IP fresh every run, since it changes
:: whenever you switch Wi-Fi networks -- nothing in the app is configured
:: with a fixed IP anymore (see rnd-ui/.env.local), so this is purely a
:: convenience printout, not something that needs editing when you switch
:: networks. Picks the real Wi-Fi/Ethernet adapter, skipping loopback,
:: link-local, and Windows' internal virtual switches (WSL/Hyper-V), which
:: aren't reachable from a phone.
set "LAN_IP="
for /f "usebackq delims=" %%A in (`powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '169.254.*' -and $_.IPAddress -ne '127.0.0.1' -and $_.InterfaceAlias -notmatch 'vEthernet|Loopback' } | Select-Object -First 1 -ExpandProperty IPAddress)"`) do set "LAN_IP=%%A"

echo ===================================================
echo   All services have been launched successfully!
echo   Do not close the individual terminal windows.
echo ===================================================
if defined LAN_IP (
  echo.
  echo   On your phone, connect to the SAME Wi-Fi as this PC, then open:
  echo     http://%LAN_IP%:5173
  echo   ^(this updates automatically each time you run this script --
  echo    no config to edit when you switch networks^)
  echo.
) else (
  echo.
  echo   Could not auto-detect a LAN IP for phone access. Run
  echo   "ipconfig" and use the IPv4 Address of your Wi-Fi adapter instead.
  echo.
)
pause
