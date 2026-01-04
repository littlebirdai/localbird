#!/bin/bash
# Standalone Localbird capture service
# Runs the Swift service independently for continuous capture

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_PATH="$SCRIPT_DIR/localbird.app/Contents/MacOS/localbird"
PORT=9111
ENV_FILE="$SCRIPT_DIR/.env"

# Also check electron/.env as fallback
if [ ! -f "$ENV_FILE" ]; then
    ENV_FILE="$SCRIPT_DIR/../electron/.env"
fi

# Load environment variables
if [ -f "$ENV_FILE" ]; then
    echo "[Standalone] Loading config from $ENV_FILE"
    export $(grep -v '^#' "$ENV_FILE" | xargs)
else
    echo "[Standalone] Warning: No .env file found"
    echo "[Standalone] Create standalone/.env with your API keys"
fi

# Check if service is already running
if curl -s "http://localhost:$PORT/" >/dev/null 2>&1; then
    echo "[Standalone] Service already running on port $PORT"
    exit 0
fi

# Check if Qdrant is running
if ! curl -s "http://localhost:6333/" >/dev/null 2>&1; then
    echo "[Standalone] Warning: Qdrant not running on localhost:6333"
    echo "[Standalone] Start Qdrant: docker start localbird-qdrant"
fi

echo "[Standalone] Starting localbird service on port $PORT..."

# Start the service in background
"$APP_PATH" --port "$PORT" &
SERVICE_PID=$!

echo "[Standalone] Service PID: $SERVICE_PID"

# Wait for service to be ready
echo "[Standalone] Waiting for service to be ready..."
for i in {1..30}; do
    if curl -s "http://localhost:$PORT/status" >/dev/null 2>&1; then
        echo "[Standalone] Service is ready"
        break
    fi
    sleep 0.5
done

# Configure the service
echo "[Standalone] Configuring service..."
curl -s -X POST "http://localhost:$PORT/configure" \
    -H "Content-Type: application/json" \
    -d "{
        \"geminiAPIKey\": \"${GEMINI_API_KEY:-}\",
        \"claudeAPIKey\": \"${ANTHROPIC_API_KEY:-}\",
        \"openaiAPIKey\": \"${OPENAI_API_KEY:-}\",
        \"captureInterval\": 5,
        \"activeVisionProvider\": \"gemini\"
    }"

echo ""

# Start capture
echo "[Standalone] Starting capture..."
curl -s -X POST "http://localhost:$PORT/capture/start"
echo ""

echo "[Standalone] Capture service running (PID: $SERVICE_PID)"
echo "[Standalone] To stop: kill $SERVICE_PID"
echo "[Standalone] Logs: tail -f /var/log/system.log | grep localbird"

# Save PID for stop script
echo "$SERVICE_PID" > "$SCRIPT_DIR/.service.pid"
