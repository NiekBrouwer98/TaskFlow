#!/bin/bash
ROOT="$(cd "$(dirname "$0")" && pwd)"

# Start backend
cd "$ROOT/backend" && node server.js &

# Start frontend
sleep 2
cd "$ROOT/frontend" && npm run dev &

# Open browser once frontend is up
sleep 4
cmd.exe /c start http://localhost:3112
