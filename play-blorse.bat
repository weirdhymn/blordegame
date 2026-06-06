@echo off
cd /d C:\Users\dvale\blorsegame

REM Start the server in its own window, pointed at the persistent file DB
start "blorse server" cmd /k "set DATABASE_URL=file:./.data/blorse&& pnpm --filter @blorse/server start"

REM Start the web client in its own window
start "blorse web" cmd /k "pnpm dev:web"

REM Give them a few seconds to boot, then open the browser
timeout /t 5 /nobreak >nul
start http://localhost:5173/

exit