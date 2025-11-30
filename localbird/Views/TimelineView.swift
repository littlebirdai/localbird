//
//  TimelineView.swift
//  localbird
//
//  Main window for browsing captured screenshots
//

import SwiftUI

struct TimelineView: View {
    @ObservedObject var coordinator: CaptureCoordinator
    @State private var frames: [FrameItem] = []
    @State private var selectedFrame: FrameItem?
    @State private var isLoading = false
    @State private var searchQuery = ""

    private let columns = [
        GridItem(.adaptive(minimum: 200, maximum: 300), spacing: 12)
    ]

    var body: some View {
        HSplitView {
            // Left: Grid of thumbnails
            VStack(spacing: 0) {
                // Search/filter bar
                HStack {
                    Image(systemName: "magnifyingglass")
                        .foregroundColor(.secondary)
                    TextField("Search captures...", text: $searchQuery)
                        .textFieldStyle(.plain)
                        .onSubmit {
                            Task { await search() }
                        }
                    if !searchQuery.isEmpty {
                        Button(action: { searchQuery = ""; Task { await loadFrames() } }) {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundColor(.secondary)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(10)
                .background(Color(nsColor: .controlBackgroundColor))

                Divider()

                // Thumbnail grid
                if isLoading {
                    Spacer()
                    ProgressView("Loading...")
                    Spacer()
                } else if frames.isEmpty {
                    Spacer()
                    VStack(spacing: 12) {
                        Image(systemName: "photo.on.rectangle.angled")
                            .font(.system(size: 48))
                            .foregroundColor(.secondary)
                        Text("No captures yet")
                            .font(.title2)
                            .foregroundColor(.secondary)
                        Text("Start capturing to see your screen history here")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    Spacer()
                } else {
                    ScrollView {
                        LazyVGrid(columns: columns, spacing: 12) {
                            ForEach(frames) { frame in
                                FrameThumbnail(frame: frame, isSelected: selectedFrame?.id == frame.id)
                                    .onTapGesture {
                                        selectedFrame = frame
                                    }
                            }
                        }
                        .padding()
                    }
                }

                // Status bar
                HStack {
                    Text("\(frames.count) captures")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Spacer()
                    Button("Refresh") {
                        Task { await loadFrames() }
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                }
                .padding(8)
                .background(Color(nsColor: .controlBackgroundColor))
            }
            .frame(minWidth: 400)

            // Right: Detail view
            if let frame = selectedFrame {
                FrameDetailView(frame: frame)
            } else {
                VStack {
                    Spacer()
                    Image(systemName: "photo")
                        .font(.system(size: 64))
                        .foregroundColor(.secondary)
                    Text("Select a capture to view details")
                        .foregroundColor(.secondary)
                    Spacer()
                }
                .frame(minWidth: 400)
            }
        }
        .frame(minWidth: 900, minHeight: 600)
        .task {
            await loadFrames()
        }
    }

    private func loadFrames() async {
        isLoading = true
        frames = await loadFramesFromDisk()
        isLoading = false
    }

    private func search() async {
        guard !searchQuery.isEmpty else {
            await loadFrames()
            return
        }

        isLoading = true
        coordinator.configure(settings: AppSettings.fromUserDefaults())
        await coordinator.searchService.search(query: searchQuery, limit: 50)

        // Convert search results to frame items
        frames = coordinator.searchService.results.compactMap { result in
            let imagePath = getImagePath(for: result.id)
            guard FileManager.default.fileExists(atPath: imagePath.path) else { return nil }
            return FrameItem(
                id: result.id,
                timestamp: result.timestamp,
                summary: result.summary,
                app: result.activeApplication,
                imagePath: imagePath
            )
        }
        isLoading = false
    }

    private func loadFramesFromDisk() async -> [FrameItem] {
        let fileManager = FileManager.default
        let appSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let framesDir = appSupport.appendingPathComponent("Localbird/frames")

        guard let files = try? fileManager.contentsOfDirectory(at: framesDir, includingPropertiesForKeys: [.contentModificationDateKey]) else {
            return []
        }

        return files
            .filter { $0.pathExtension == "jpg" }
            .compactMap { url -> FrameItem? in
                guard let id = UUID(uuidString: url.deletingPathExtension().lastPathComponent),
                      let attrs = try? fileManager.attributesOfItem(atPath: url.path),
                      let modDate = attrs[.modificationDate] as? Date else {
                    return nil
                }
                return FrameItem(id: id, timestamp: modDate, summary: nil, app: nil, imagePath: url)
            }
            .sorted { $0.timestamp > $1.timestamp }
    }

    private func getImagePath(for id: UUID) -> URL {
        let fileManager = FileManager.default
        let appSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        return appSupport.appendingPathComponent("Localbird/frames/\(id.uuidString).jpg")
    }
}

struct FrameItem: Identifiable {
    let id: UUID
    let timestamp: Date
    let summary: String?
    let app: String?
    let imagePath: URL
}

struct FrameThumbnail: View {
    let frame: FrameItem
    let isSelected: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            // Thumbnail image
            if let nsImage = NSImage(contentsOf: frame.imagePath) {
                Image(nsImage: nsImage)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(height: 120)
                    .clipped()
                    .cornerRadius(8)
            } else {
                Rectangle()
                    .fill(Color.gray.opacity(0.3))
                    .frame(height: 120)
                    .cornerRadius(8)
            }

            // Metadata
            VStack(alignment: .leading, spacing: 2) {
                if let summary = frame.summary {
                    Text(summary)
                        .font(.caption)
                        .lineLimit(2)
                }
                Text(frame.timestamp.formatted(date: .abbreviated, time: .shortened))
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
        }
        .padding(8)
        .background(isSelected ? Color.accentColor.opacity(0.2) : Color(nsColor: .controlBackgroundColor))
        .cornerRadius(10)
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(isSelected ? Color.accentColor : Color.clear, lineWidth: 2)
        )
    }
}

struct FrameDetailView: View {
    let frame: FrameItem
    @State private var metadata: SearchResult?

    var body: some View {
        VStack(spacing: 0) {
            // Full image
            if let nsImage = NSImage(contentsOf: frame.imagePath) {
                Image(nsImage: nsImage)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color.black)
            }

            // Metadata panel
            VStack(alignment: .leading, spacing: 8) {
                if let summary = frame.summary ?? metadata?.summary {
                    Text(summary)
                        .font(.body)
                }

                HStack {
                    if let app = frame.app ?? metadata?.activeApplication {
                        Label(app, systemImage: "app")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }

                    Text(frame.timestamp.formatted(date: .complete, time: .standard))
                        .font(.caption)
                        .foregroundColor(.secondary)

                    Spacer()

                    Button("Open in Finder") {
                        NSWorkspace.shared.activateFileViewerSelecting([frame.imagePath])
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                }
            }
            .padding()
            .background(Color(nsColor: .controlBackgroundColor))
        }
    }
}

#Preview {
    TimelineView(coordinator: CaptureCoordinator())
}
