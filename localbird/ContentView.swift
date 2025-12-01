//
//  ContentView.swift
//  localbird
//
//  Status view and search interface
//

import SwiftUI

struct ContentView: View {
    @ObservedObject var coordinator: CaptureCoordinator
    @State private var searchQuery = ""
    @State private var showingSearch = false

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Image(systemName: "bird.fill")
                    .font(.title2)
                Text("Localbird")
                    .font(.headline)
                Spacer()
                Button(action: { showingSearch.toggle() }) {
                    Image(systemName: showingSearch ? "xmark.circle.fill" : "magnifyingglass")
                        .foregroundColor(.secondary)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal)
            .padding(.vertical, 10)

            Divider()

            if showingSearch {
                searchView
            } else {
                statusView
            }
        }
        .frame(width: 320, height: showingSearch ? 400 : 230)
    }

    private var statusView: some View {
        VStack(spacing: 12) {
            // Status
            VStack(alignment: .leading, spacing: 8) {
                StatusRow(
                    label: "Status",
                    value: coordinator.isRunning ? "Capturing" : "Stopped",
                    color: coordinator.isRunning ? .green : .secondary
                )

                StatusRow(
                    label: "Frames",
                    value: "\(coordinator.processedFrames)"
                )

                if let lastTime = coordinator.lastProcessedTime {
                    StatusRow(
                        label: "Last Capture",
                        value: lastTime.formatted(date: .omitted, time: .shortened)
                    )
                }

                if let error = coordinator.lastError {
                    StatusRow(
                        label: "Error",
                        value: error,
                        color: .red
                    )
                }
            }
            .padding(.horizontal)

            Spacer()

            // Quick Actions
            HStack(spacing: 8) {
                Button(coordinator.isRunning ? "Stop" : "Start") {
                    if coordinator.isRunning {
                        coordinator.stopCapture()
                    } else {
                        Task {
                            coordinator.configure(settings: AppSettings.fromUserDefaults())
                            await coordinator.startCapture()
                        }
                    }
                }
                .buttonStyle(.borderedProminent)
                .tint(coordinator.isRunning ? .red : .green)

                Button("Browse") {
                    openTimelineWindow()
                }
                .buttonStyle(.bordered)
            }
            .padding(.bottom, 4)

            HStack(spacing: 8) {
                SettingsLink {
                    Text("Settings")
                }
                .buttonStyle(.bordered)

                Button("Quit") {
                    NSApplication.shared.terminate(nil)
                }
                .buttonStyle(.bordered)
            }
            .padding(.bottom)
        }
        .padding(.top)
    }

    private var searchView: some View {
        VStack(spacing: 0) {
            // Search field
            HStack {
                Image(systemName: "magnifyingglass")
                    .foregroundColor(.secondary)
                TextField("Search your screen history...", text: $searchQuery)
                    .textFieldStyle(.plain)
                    .onSubmit {
                        Task {
                            coordinator.configure(settings: AppSettings.fromUserDefaults())
                            await coordinator.searchService.search(query: searchQuery)
                        }
                    }
                if coordinator.searchService.isSearching {
                    ProgressView()
                        .scaleEffect(0.7)
                }
            }
            .padding(10)
            .background(Color(nsColor: .controlBackgroundColor))

            Divider()

            // Results
            if coordinator.searchService.results.isEmpty {
                VStack(spacing: 8) {
                    Spacer()
                    if coordinator.searchService.isSearching {
                        Text("Searching...")
                            .foregroundColor(.secondary)
                    } else if !searchQuery.isEmpty {
                        Image(systemName: "doc.text.magnifyingglass")
                            .font(.largeTitle)
                            .foregroundColor(.secondary)
                        Text("No results found")
                            .foregroundColor(.secondary)
                    } else {
                        Image(systemName: "magnifyingglass")
                            .font(.largeTitle)
                            .foregroundColor(.secondary)
                        Text("Enter a search query")
                            .foregroundColor(.secondary)
                        Text("e.g., \"working on code\", \"reading email\"")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    Spacer()
                }
            } else {
                ScrollView {
                    LazyVStack(spacing: 1) {
                        ForEach(coordinator.searchService.results) { result in
                            SearchResultRow(result: result, searchService: coordinator.searchService)
                        }
                    }
                }
            }

            if let error = coordinator.searchService.error {
                Text(error)
                    .font(.caption)
                    .foregroundColor(.red)
                    .padding(8)
            }
        }
    }

    private func openTimelineWindow() {
        // Create and show timeline window using AppKit
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1200, height: 800),
            styleMask: [.titled, .closable, .resizable, .miniaturizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Timeline"
        window.contentView = NSHostingView(rootView: TimelineView(coordinator: coordinator))
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }
}

struct SearchResultRow: View {
    let result: SearchResult
    let searchService: SearchService
    @State private var isHovering = false

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            // Thumbnail
            if let imagePath = searchService.imagePath(for: result),
               let nsImage = NSImage(contentsOf: imagePath) {
                Image(nsImage: nsImage)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(width: 60, height: 40)
                    .cornerRadius(4)
                    .clipped()
            } else {
                Rectangle()
                    .fill(Color.gray.opacity(0.3))
                    .frame(width: 60, height: 40)
                    .cornerRadius(4)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(result.summary)
                    .font(.callout)
                    .lineLimit(2)

                HStack(spacing: 8) {
                    if let app = result.activeApplication {
                        Label(app, systemImage: "app")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                    }
                    Text(result.timestamp.formatted(date: .abbreviated, time: .shortened))
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
            }

            Spacer()

            // Relevance score
            Text(String(format: "%.0f%%", result.score * 100))
                .font(.caption2)
                .foregroundColor(.secondary)
        }
        .padding(8)
        .background(isHovering ? Color.accentColor.opacity(0.1) : Color.clear)
        .onHover { hovering in
            isHovering = hovering
        }
    }
}

struct StatusRow: View {
    let label: String
    let value: String
    var color: Color = .primary

    var body: some View {
        HStack {
            Text(label)
                .foregroundColor(.secondary)
            Spacer()
            Text(value)
                .foregroundColor(color)
                .lineLimit(1)
        }
        .font(.callout)
    }
}

#Preview {
    ContentView(coordinator: CaptureCoordinator())
}
