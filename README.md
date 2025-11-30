# Localbird

A macOS menu bar app that continuously captures screenshots, analyzes them with LLMs, and stores them in a local vector database for semantic search.

## Features

- Continuous screen capture with configurable intervals
- LLM-powered image analysis (Gemini, Claude, OpenAI)
- Local vector storage with Qdrant
- Semantic search across your screen history
- Timeline view for visual browsing

## Requirements

- macOS 13+
- [Qdrant](https://qdrant.tech/) running locally (`docker run -p 6333:6333 qdrant/qdrant`)
- API key for at least one LLM provider (Gemini recommended for vision)

## Setup

1. Start Qdrant: `docker run -p 6333:6333 qdrant/qdrant`
2. Build and run in Xcode
3. Grant screen recording permission when prompted
4. Add your API key in Settings
5. Click "Start" to begin capturing

## Usage

- **Menu bar icon**: Click to show status, start/stop capture, or search
- **Browse**: Opens timeline window to visually scroll through captures
- **Search**: Semantic search across all captured screenshots
