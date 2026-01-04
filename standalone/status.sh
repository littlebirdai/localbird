#!/bin/bash
# Check status of standalone Localbird capture service

PORT=9111

if curl -s "http://localhost:$PORT/status" >/dev/null 2>&1; then
    echo "[Standalone] Service is running"
    curl -s "http://localhost:$PORT/status" | python3 -m json.tool 2>/dev/null || curl -s "http://localhost:$PORT/status"
else
    echo "[Standalone] Service is not running"
    exit 1
fi
