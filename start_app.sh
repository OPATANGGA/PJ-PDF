#!/usr/bin/env bash
set -e

echo "==============================================================="
echo "  🚀 PDF Studio Pro (macOS / Linux / Mobile LAN Server)"
echo "  💻 Local URL: http://127.0.0.1:8000"
echo "==============================================================="

if command -v open >/dev/null 2>&1; then
    open "http://127.0.0.1:8000" &
elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "http://127.0.0.1:8000" &
fi

python3 -m uvicorn app:app --host 0.0.0.0 --port 8000
