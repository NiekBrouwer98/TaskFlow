@echo off
title TaskFlow Launcher
set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"

start "TaskFlow Backend" cmd /k "cd /d "%ROOT%\backend" && npm start"
timeout /t 2 /nobreak >nul
start "TaskFlow Frontend" cmd /k "cd /d "%ROOT%\frontend" && npm run dev"
timeout /t 4 /nobreak >nul
start "" "http://localhost:3112"

exit
