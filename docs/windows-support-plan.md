# Windows Support Implementation Plan

## Summary

Add Windows support to Localbird by:
1. Building a C# .NET 8 capture service using Windows.Graphics.Capture + UI Automation
2. Refactoring Electron to consolidate LLM/Qdrant logic (reducing native service responsibility)
3. Creating a platform-agnostic bridge that works with either Swift (macOS) or C# (Windows)

## Architecture After Changes

```
┌─────────────────────────────────────────────────────────────────┐
│ Electron App (Cross-Platform)                                   │
├─────────────────────────────────────────────────────────────────┤
│ Main Process                                                    │
│  ├─ native-bridge.ts      Platform detection, spawns service   │
│  ├─ frame-processor.ts    LLM analysis + embedding + Qdrant    │
│  ├─ llm/                  Provider abstraction (Gemini/Claude) │
│  ├─ qdrant.ts             Vector storage (extended)            │
│  └─ server.ts             Chat API (unchanged)                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTP (localhost:9111)
           ┌───────────────┴───────────────┐
           │                               │
┌──────────▼──────────┐      ┌─────────────▼─────────────┐
│ Swift Service       │      │ C# Service                │
│ (macOS)             │      │ (Windows)                 │
├─────────────────────┤      ├───────────────────────────┤
│ ScreenCaptureKit    │      │ Windows.Graphics.Capture  │
│ AXUIElement API     │      │ UI Automation             │
│ HTTP Server (:9111) │      │ ASP.NET Minimal API       │
└─────────────────────┘      └───────────────────────────┘
```

## Implementation Phases

### Phase 1: Windows C# Capture Service

**Create new project: `LocalbirdCapture/`**

```
LocalbirdCapture/
├── LocalbirdCapture.csproj    # .NET 8, win-x64, self-contained
├── Program.cs                  # ASP.NET minimal API entry
├── Models/
│   ├── CapturedFrame.cs       # Matches Swift CapturedFrame
│   ├── AccessibilitySnapshot.cs
│   └── ServiceConfig.cs       # captureInterval only (no LLM keys)
├── Services/
│   ├── ScreenCaptureService.cs    # Windows.Graphics.Capture
│   ├── AccessibilityService.cs    # UI Automation (depth 4)
│   ├── ForegroundWindowMonitor.cs # Polls GetForegroundWindow
│   └── CaptureCoordinator.cs      # Orchestrates capture only
└── Utilities/
    ├── ImageProcessor.cs      # JPEG 0.7 quality, max 1440px
    └── WindowHelper.cs        # Win32 interop
```

**HTTP Endpoints (same contract as Swift):**
- `GET /health` → `{"status": "ok"}`
- `GET /status` → `{isRunning, frameCount, lastCaptureTime, lastError}`
- `POST /configure` → `{captureInterval, enableFullScreenCaptures, fullScreenCaptureInterval}`
- `POST /capture/start` → `{"success": true}`
- `POST /capture/stop` → `{"success": true}`
- `GET /frame/latest` → **NEW** - Returns latest frame with base64 image + accessibility

**Key Implementation Details:**
- Target: `net8.0-windows10.0.19041.0` (Windows 10 1903+)
- Single-file publish: `dotnet publish -c Release -r win-x64 --self-contained -p:PublishSingleFile=true`
- Screen capture: `GraphicsCaptureItem.CreateFromWindowId()` via COM interop
- Accessibility: `System.Windows.Automation` with 4-level depth limit
- Window monitoring: Poll `GetForegroundWindow()` every 250ms

### Phase 2: Electron Refactoring

**2a. Rename and extend bridge**

`swift-bridge.ts` → `native-bridge.ts`

```typescript
// Platform detection
function getServicePath(): string {
  if (process.platform === 'darwin') {
    // macOS: Swift service
    return app.isPackaged
      ? path.join(process.resourcesPath, 'bin', 'localbird-service')
      : path.join(app.getAppPath(), '..', 'DerivedData/Build/Products/Debug/localbird.app/Contents/MacOS/localbird')
  } else {
    // Windows: C# service
    return app.isPackaged
      ? path.join(process.resourcesPath, 'bin', 'LocalbirdCapture.exe')
      : path.join(app.getAppPath(), '..', 'LocalbirdCapture/bin/Debug/net8.0-windows/LocalbirdCapture.exe')
  }
}

// New method to get frames
async getLatestFrame(): Promise<CapturedFrameData | null>
```

**2b. Create LLM service abstraction**

New directory: `electron/src/main/llm/`

```
llm/
├── index.ts           # LLMService class
├── types.ts           # FrameAnalysis, etc.
└── providers/
    ├── base.ts        # LLMProvider interface
    ├── gemini.ts      # Vision + embeddings
    ├── claude.ts      # Chat only (no embeddings)
    └── openai.ts      # Vision + embeddings + chat
```

Key interface:
```typescript
interface LLMProvider {
  name: string
  supportsVision: boolean
  supportsEmbeddings: boolean
  analyzeImage(imageBuffer: Buffer, prompt: string): Promise<FrameAnalysis>
  generateEmbedding(text: string): Promise<number[]>
}
```

**2c. Create frame processor**

New file: `electron/src/main/frame-processor.ts`

Pipeline (replicates Swift CaptureCoordinator):
1. Receive frame from native via `GET /frame/latest`
2. Decode base64 image to Buffer
3. Call LLM vision API → `FrameAnalysis`
4. Build searchable text from analysis + accessibility
5. Generate embedding via Gemini/OpenAI
6. Save image to `~/Library/Application Support/Localbird/frames/` (or `%LOCALAPPDATA%\Localbird\frames\`)
7. Upsert to Qdrant with full payload

**2d. Extend Qdrant client**

Add to `electron/src/main/qdrant.ts`:
- `ensureCollection(vectorSize = 768)`
- `upsertFrame(frame: ProcessedFrame)` with full payload matching Swift

### Phase 3: Swift Service Simplification

**Remove from Swift service:**
- LLM API calls (GeminiProvider, ClaudeProvider, OpenAIProvider)
- Embedding generation
- Qdrant client and storage
- API key configuration handling

**Add to Swift service:**
- `GET /frame/latest` endpoint returning:
  ```json
  {
    "id": "uuid",
    "timestamp": 1234567890,
    "imageBase64": "...",
    "windowTitle": "...",
    "appName": "...",
    "appBundleId": "...",
    "accessibilityData": {...}
  }
  ```
- Store latest frame in memory (not just save to disk)

**Keep in Swift service:**
- ScreenCaptureService (unchanged)
- AccessibilityService (unchanged)
- HTTPServer (add new endpoint)
- CaptureCoordinator (simplified - capture only)

### Phase 4: Integration and Testing

1. **Frame polling in Electron:**
   ```typescript
   // Poll every 500ms for new frames
   setInterval(async () => {
     const frame = await nativeBridge.getLatestFrame()
     if (frame && frame.timestamp > lastProcessedTimestamp) {
       await frameProcessor.process(frame)
       lastProcessedTimestamp = frame.timestamp
     }
   }, 500)
   ```

2. **Verify data parity:** Ensure TypeScript produces identical Qdrant entries as Swift

3. **Test on both platforms** before removing Swift LLM code

## Files to Modify

| File | Changes |
|------|---------|
| `electron/src/main/swift-bridge.ts` | Rename to `native-bridge.ts`, add platform detection, add `getLatestFrame()` |
| `electron/src/main/index.ts` | Import new bridge, start frame polling, wire up processor |
| `electron/src/main/qdrant.ts` | Add `ensureCollection()`, `upsertFrame()` |
| `electron/package.json` | Add Windows extraResources for C# binary |
| `localbird/Services/HTTPServer.swift` | Add `/frame/latest` endpoint |
| `localbird/Services/CaptureCoordinator.swift` | Store latest frame, remove LLM/Qdrant calls |

## New Files to Create

| File | Purpose |
|------|---------|
| `LocalbirdCapture/` | Entire C# project (see Phase 1 structure) |
| `electron/src/main/native-bridge.ts` | Platform-agnostic service bridge |
| `electron/src/main/frame-processor.ts` | LLM analysis + Qdrant storage pipeline |
| `electron/src/main/llm/index.ts` | LLM service coordinator |
| `electron/src/main/llm/types.ts` | TypeScript interfaces |
| `electron/src/main/llm/providers/*.ts` | Provider implementations |

## Build Configuration

**electron-builder (package.json):**
```json
{
  "build": {
    "mac": {
      "extraResources": [
        {"from": "../DerivedData/Build/Products/Release/localbird.app", "to": "bin/localbird-service"}
      ]
    },
    "win": {
      "target": ["nsis"],
      "extraResources": [
        {"from": "../LocalbirdCapture/publish/LocalbirdCapture.exe", "to": "bin/LocalbirdCapture.exe"},
        {"from": "bin/qdrant-x64.exe", "to": "bin/qdrant-x64.exe"}
      ]
    }
  }
}
```

**C# build command:**
```bash
cd LocalbirdCapture
dotnet publish -c Release -r win-x64 --self-contained -p:PublishSingleFile=true -o ./publish
```

## Verification Plan

1. **Unit test C# capture service:**
   - Verify `/health`, `/status`, `/configure` endpoints
   - Verify screenshot capture returns valid JPEG
   - Verify accessibility tree extraction

2. **Integration test Electron frame processing:**
   - Mock native service, verify LLM calls work
   - Verify Qdrant entries match expected schema

3. **End-to-end test:**
   - Start app on Windows, verify frames appear in timeline
   - Verify semantic search works with new frames
   - Compare search quality to macOS

## Migration Path (Incremental)

1. Add TypeScript LLM service (no behavior change yet)
2. Add frame processor (test in isolation)
3. Add `/frame/latest` to Swift service
4. Wire up Electron polling (dual processing mode)
5. Verify parity between Swift and Electron processing
6. Remove LLM/Qdrant from Swift service
7. Build and test C# Windows service
8. Package for both platforms
