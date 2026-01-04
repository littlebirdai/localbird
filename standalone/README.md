# Standalone Capture Service

Run the Localbird capture service independently from the Electron app. This allows continuous screen capture while developing/testing the Electron UI.

## Setup

1. Build the Swift app in Xcode (Debug mode)
2. Copy the built app:
   ```bash
   cp -R ~/Library/Developer/Xcode/DerivedData/localbird*/Build/Products/Debug/localbird.app ./
   ```
3. Create `.env` file with your API keys (or it will use `../electron/.env`):
   ```
   GEMINI_API_KEY=your_key
   ANTHROPIC_API_KEY=your_key
   ```

## Usage

```bash
# Start the capture service
./start.sh

# Check status
./status.sh

# Stop the service
./stop.sh
```

## How it works

- The standalone service runs on port 9111
- When Electron dev starts, it detects the existing service and uses it instead of spawning a new one
- The service keeps capturing even when Electron is stopped/restarted
- Frames are stored in Qdrant for semantic search

## Requirements

- Qdrant running on localhost:6333
- At least one LLM API key (Gemini recommended for vision)
