#!/bin/bash
# Stop the standalone Localbird capture service

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$SCRIPT_DIR/.service.pid"
PORT=9111

# Try to stop via HTTP first
if curl -s "http://localhost:$PORT/status" >/dev/null 2>&1; then
    echo "[Standalone] Stopping capture..."
    curl -s -X POST "http://localhost:$PORT/capture/stop"
    echo ""
fi

# Kill by PID file
if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if ps -p "$PID" >/dev/null 2>&1; then
        echo "[Standalone] Killing service (PID: $PID)..."
        kill "$PID"
        rm "$PID_FILE"
        echo "[Standalone] Service stopped"
    else
        echo "[Standalone] Service not running (stale PID file)"
        rm "$PID_FILE"
    fi
else
    # Try to find and kill by process name
    PIDS=$(pgrep -f "localbird.app/Contents/MacOS/localbird")
    if [ -n "$PIDS" ]; then
        echo "[Standalone] Killing localbird processes: $PIDS"
        kill $PIDS
        echo "[Standalone] Service stopped"
    else
        echo "[Standalone] No localbird service running"
    fi
fi
