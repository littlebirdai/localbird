# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run

Localbird has two components: an Electron app (UI) and a Swift service (capture).

### Electron App (UI)
```bash
cd electron
pnpm install
node node_modules/electron/install.js  # Required: pnpm blocks build scripts
pnpm dev        # Development with hot reload
pnpm build      # Production build
```

Create `electron/.env` with your API keys:
```
ANTHROPIC_API_KEY=sk-ant-...
```

### Swift Service (Capture)
Build via command line (user does not use Xcode):
```bash
xcodebuild -project localbird.xcodeproj -scheme localbird -configuration Debug -derivedDataPath DerivedData CODE_SIGN_IDENTITY="-" CODE_SIGNING_REQUIRED=NO CODE_SIGNING_ALLOWED=NO build
```
The Electron app spawns this service automatically.

**Dev path setup:** The Electron app expects Swift binary at `DerivedData/Build/Products/Debug/localbird.app` (relative to project root). If Xcode builds to global DerivedData, create a symlink:
```bash
mkdir -p DerivedData/Build/Products/Debug
ln -s ~/Library/Developer/Xcode/DerivedData/localbird-*/Build/Products/Debug/localbird.app DerivedData/Build/Products/Debug/
```

**Requirements:**
- macOS 13+
- Node.js 24+
- Qdrant running locally with persistent storage:
  ```bash
  docker run -d --name localbird-qdrant -p 6333:6333 \
    -v ~/Library/Application\ Support/Localbird/qdrant:/qdrant/storage \
    qdrant/qdrant
  ```
- API key for at least one LLM provider (Claude works for both vision and chat; Gemini free tier has low rate limits)

**Testing:**
- Swift unit tests: `localbirdTests/` - run via Xcode (Cmd+U)
- Tests use Swift Testing framework (`import Testing`, `@Test` attribute)

## Architecture

Localbird captures screenshots, analyzes them with LLMs, and stores embeddings in Qdrant for semantic search via an AI chat interface.

```
Electron App (UI)                    Swift Service (Capture)
├─ Main Process                      ├─ HTTPServer (:9111)
│  ├─ Tray icon                      │  ├─ GET /status
│  ├─ Express server (:3001)         │  ├─ POST /configure
│  │  └─ POST /api/chat              │  ├─ POST /capture/start
│  ├─ Qdrant client                  │  └─ POST /capture/stop
│  └─ Swift bridge (spawns service)  ├─ CaptureCoordinator
└─ Renderer (React + assistant-ui)   │  ├─ ScreenCaptureService
   ├─ Chat (assistant-ui Thread)     │  ├─ AccessibilityService
   ├─ Timeline                       │  ├─ LLMService → FrameAnalysis
   └─ Settings                       │  └─ QdrantClient → storage
                                     └─ Frames saved to disk
```

### Electron Main Process (`electron/src/main/`)

- **index.ts** - App entry, tray setup, window management, IPC handlers
- **server.ts** - Express server with `/api/chat` endpoint using Vercel AI SDK for streaming
- **swift-bridge.ts** - Spawns Swift service, sends HTTP commands, monitors health
- **qdrant.ts** - Vector search client (queries localhost:6333)

### Electron Renderer (`electron/src/renderer/`)

- **App.tsx** - Main layout with sidebar navigation
- **components/Chat.tsx** - Uses `@assistant-ui/react` with `useChatRuntime`
- **components/Timeline.tsx** - Grid of captured frames with search
- **components/Settings.tsx** - API keys, capture settings, provider selection

### Swift Service (`localbird/`)

The Swift app runs as a headless background service controlled via HTTP.

- **localbirdApp.swift** - Service entry point, starts HTTPServer
- **Services/HTTPServer.swift** - Lightweight HTTP server using Network framework
- **Services/CaptureCoordinator.swift** - Orchestrates capture pipeline
- **Services/ScreenCaptureService.swift** - ScreenCaptureKit integration
- **Services/LLM/** - Provider abstractions (Gemini, Claude, OpenAI)
- **Services/VectorDB/QdrantClient.swift** - Qdrant storage

### Data Flow

1. Electron spawns Swift service on startup
2. Electron sends `/configure` with API keys
3. Swift captures screenshots at intervals via ScreenCaptureKit
4. Each frame: accessibility snapshot → LLM vision analysis → embedding → Qdrant
5. Images saved to `~/Library/Application Support/Localbird/frames/`
6. Chat queries: Electron generates embedding → searches Qdrant → builds context → streams LLM response

### IPC (Electron ↔ Swift)

Swift service exposes HTTP endpoints on localhost:9111:
- `GET /status` → `{ isRunning, frameCount, lastCaptureTime, lastError }`
- `POST /configure` → receives API keys and settings as JSON
- `POST /capture/start` → starts capture loop
- `POST /capture/stop` → stops capture

Electron renderer uses preload API (`window.api`) for IPC with main process.

## Claude Code Screen Access

When Localbird is running, Claude Code can view recent screen captures:

```bash
# Get path to most recent capture
curl -s http://localhost:3001/api/frames/latest
# Returns: {"path": "/Users/.../frames/xxx.jpg", "id": "xxx", "timestamp": "..."}
```

Then use the Read tool on the returned path to view the screenshot. This enables Claude Code to "see" what's on screen without manual screenshot sharing.

## Common Errors to Avoid

- When testing Gemini API, use `gemini-2.5-flash` or `gemini-3-flash-preview`, not `gemini-2.0-flash` (older models have stricter/different rate limits)
- **Chat model must be `claude-opus-4-5`** - do NOT change to Sonnet or other models in `server.ts` (the date suffix like `-20250514` causes 404 errors). If you must fall back, use `claude-sonnet-4-5` NOT `claude-sonnet-4` - never fall back to old models.

## Build & Distribution Notes

### Spawning Child Processes
When spawning Qdrant or other child processes, **always set `cwd`** in spawn options. Apps launched from Finder have a different working directory than terminal launches, causing child processes to fail silently.

### macOS Code Signing & Notarization
For distribution, the app must be signed with a Developer ID certificate and notarized:
- Set `identity` in electron-builder mac config (just the name, not "Developer ID Application:" prefix)
- Create `electron/electron-builder.env` with `APPLE_ID`, `APPLE_ID_PASSWORD` (app-specific), `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`
- The `afterPack.cjs` hook signs bundled binaries (Qdrant, Swift service) with the same identity
- Notarization happens automatically via `afterSign` hook

### Swift Service for Distribution
The packaged app expects `localbird-service` binary at repo root. After building Swift:
```bash
cp DerivedData/Build/Products/Release/localbird.app/Contents/MacOS/localbird ./localbird-service
codesign --force --options runtime --sign "Developer ID Application: ..." ./localbird-service
```

### Dev Mode Binary Paths
Dev mode checks multiple paths for Qdrant binary since `__dirname` varies. If binary not found, check the path resolution in `getQdrantPath()`.

### API Keys Storage
- Dev: `electron/.env` (ANTHROPIC_API_KEY, GEMINI_API_KEY)
- Production: `~/Library/Application Support/localbird/config.json`

### Vision Provider Recommendation
Use **Claude for vision** - Gemini free tier has severe rate limits (5 requests/minute). Claude has no such limits for paid API.

## User-Specific Notes

- Screenshots for debugging are saved to `iCloud Drive/Documents/Screenshots`
