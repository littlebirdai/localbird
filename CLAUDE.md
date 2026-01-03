# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run

Localbird has two components: an Electron app (UI) and a Swift service (capture).

### Electron App (UI)
```bash
cd electron
pnpm install
pnpm dev        # Development with hot reload
pnpm build      # Production build
```

### Swift Service (Capture)
Open `localbird.xcodeproj` in Xcode and build (Cmd+B). The Electron app spawns this service automatically.

**Requirements:**
- macOS 13+
- Node.js 24+
- Qdrant running locally: `docker run -p 6333:6333 qdrant/qdrant`
- API key for at least one LLM provider (Gemini recommended for vision, Claude for chat)

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
