# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run

This is a macOS SwiftUI app built with Xcode. Open `localbird.xcodeproj` and build/run from Xcode (Cmd+R).

**Requirements:**
- macOS 13+
- Qdrant running locally: `docker run -p 6333:6333 qdrant/qdrant`
- API key for at least one LLM provider (Gemini recommended)

**Testing:**
- Unit tests: `localbirdTests/` - run via Xcode (Cmd+U)
- UI tests: `localbirdUITests/`
- Tests use Swift Testing framework (`import Testing`, `@Test` attribute)

## Architecture

Localbird is a menu bar app that continuously captures screenshots, analyzes them with LLMs, and stores embeddings in Qdrant for semantic search.

### Capture Pipeline (CaptureCoordinator)

The `CaptureCoordinator` orchestrates the entire data flow:

1. **ScreenCaptureService** - Uses ScreenCaptureKit to capture screenshots at configurable intervals (default 5s). Images are downsampled to max 1440px width and saved as JPEG.

2. **AccessibilityService** - Extracts focused app name, window title, and UI element tree from the accessibility API. Provides context for LLM analysis.

3. **LLMService** - Sends screenshot + accessibility context to vision LLM, receives structured `FrameAnalysis` (summary, active app, user activity, visible text).

4. **Embedding Generation** - Creates text embedding from analysis + accessibility data for vector search.

5. **QdrantClient** - Stores frame metadata and embedding in local Qdrant collection (`localbird_frames`).

### LLM Provider System

`LLMService` manages multiple providers with hot-swap capability:

- **LLMProvider protocol** - Defines `analyzeImage()`, `generateEmbedding()`, `chat()` with capability flags (`supportsVision`, `supportsEmbeddings`)
- **Providers**: `GeminiProvider`, `ClaudeProvider`, `OpenAIProvider`
- Gemini is the default/recommended provider for both vision and embeddings
- Each capability (vision, embedding, chat) can use a different provider

### Data Model

`CapturedFrame` contains: image data, timestamp, `AccessibilitySnapshot`, `FrameAnalysis`, and embedding vector. Images are stored on disk at `~/Library/Application Support/Localbird/frames/{uuid}.jpg`.

### UI Structure

- **AppDelegate** - Creates menu bar status item with popover (`ContentView`)
- **ContentView** - Status display and search interface in popover
- **TimelineView** - Standalone window with grid of captured frames and detail panel
- **SettingsView** - API keys, capture interval, vision provider selection, Qdrant connection

### Search Flow

`SearchService.search()` generates an embedding for the query text, then calls `QdrantClient.search()` for cosine similarity search against stored frame embeddings.
