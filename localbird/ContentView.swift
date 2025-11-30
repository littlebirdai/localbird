//
//  ContentView.swift
//  localbird
//
//  Status view shown from menu bar (placeholder for future chat interface)
//

import SwiftUI

struct ContentView: View {
    @ObservedObject var coordinator: CaptureCoordinator

    var body: some View {
        VStack(spacing: 16) {
            // Header
            HStack {
                Image(systemName: "bird.fill")
                    .font(.title)
                Text("Localbird")
                    .font(.title2.bold())
            }
            .padding(.top)

            Divider()

            // Status
            VStack(alignment: .leading, spacing: 12) {
                StatusRow(
                    label: "Status",
                    value: coordinator.isRunning ? "Capturing" : "Stopped",
                    color: coordinator.isRunning ? .green : .secondary
                )

                StatusRow(
                    label: "Frames Processed",
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
                        label: "Last Error",
                        value: error,
                        color: .red
                    )
                }
            }
            .padding(.horizontal)

            Divider()

            // Quick Actions
            HStack(spacing: 12) {
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

                Button("Settings") {
                    NSApp.sendAction(Selector(("showSettingsWindow:")), to: nil, from: nil)
                    NSApp.activate(ignoringOtherApps: true)
                }
                .buttonStyle(.bordered)
            }
            .padding(.bottom)
        }
        .frame(width: 280)
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
