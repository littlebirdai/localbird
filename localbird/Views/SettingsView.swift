//
//  SettingsView.swift
//  localbird
//

import SwiftUI

struct SettingsView: View {
    @AppStorage("geminiAPIKey") private var geminiAPIKey = ""
    @AppStorage("claudeAPIKey") private var claudeAPIKey = ""
    @AppStorage("openaiAPIKey") private var openaiAPIKey = ""
    @AppStorage("captureInterval") private var captureInterval = 5.0
    @AppStorage("enableFullScreenCaptures") private var enableFullScreenCaptures = true
    @AppStorage("fullScreenCaptureInterval") private var fullScreenCaptureInterval = 1.0
    @AppStorage("qdrantHost") private var qdrantHost = "localhost"
    @AppStorage("qdrantPort") private var qdrantPort = 6333
    @AppStorage("activeVisionProvider") private var activeVisionProvider = "gemini"

    @State private var qdrantStatus = "Checking..."

    var body: some View {
        TabView {
            generalSettings
                .tabItem {
                    Label("General", systemImage: "gear")
                }

            apiSettings
                .tabItem {
                    Label("API Keys", systemImage: "key")
                }

            vectorDBSettings
                .tabItem {
                    Label("Vector DB", systemImage: "cylinder")
                }
        }
        .frame(width: 500, height: 380)
        .onAppear {
            checkQdrantStatus()
        }
    }

    private var generalSettings: some View {
        VStack(alignment: .leading, spacing: 20) {
            GroupBox("Capture Settings") {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Text("Capture Interval:")
                            .frame(width: 150, alignment: .leading)
                        TextField("", value: $captureInterval, format: .number)
                            .textFieldStyle(.roundedBorder)
                            .frame(width: 60)
                        Text("seconds")
                            .foregroundColor(.secondary)
                    }

                    HStack {
                        Text("Vision Provider:")
                            .frame(width: 150, alignment: .leading)
                        Picker("", selection: $activeVisionProvider) {
                            Text("Gemini").tag("gemini")
                            Text("Claude").tag("claude")
                            Text("OpenAI").tag("openai")
                        }
                        .labelsHidden()
                        .frame(width: 120)
                    }

                    Divider()

                    Toggle("Full Screen Captures", isOn: $enableFullScreenCaptures)
                        .toggleStyle(.checkbox)

                    if enableFullScreenCaptures {
                        HStack {
                            Text("Full Screen Interval:")
                                .frame(width: 150, alignment: .leading)
                            TextField("", value: $fullScreenCaptureInterval, format: .number)
                                .textFieldStyle(.roundedBorder)
                                .frame(width: 60)
                            Text("seconds")
                                .foregroundColor(.secondary)
                        }
                        .padding(.leading, 20)

                        Text("Captures full screen periodically for additional context")
                            .font(.caption)
                            .foregroundColor(.secondary)
                            .padding(.leading, 20)
                    }
                }
                .padding(8)
            }

            GroupBox("Permissions") {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Text("Screen Recording:")
                            .frame(width: 120, alignment: .leading)
                        Button("Request Permission") {
                            Task { await ScreenCaptureService.requestPermission() }
                        }
                    }

                    HStack {
                        Text("Accessibility:")
                            .frame(width: 120, alignment: .leading)
                        Button("Request Permission") {
                            AccessibilityService.requestPermission()
                        }
                    }
                }
                .padding(8)
            }

            Spacer()
        }
        .padding(20)
    }

    private var apiSettings: some View {
        VStack(alignment: .leading, spacing: 16) {
            GroupBox("Gemini (Recommended for Vision)") {
                SecureField("API Key", text: $geminiAPIKey)
                    .textFieldStyle(.roundedBorder)
                    .padding(8)
            }

            GroupBox("Claude") {
                SecureField("API Key", text: $claudeAPIKey)
                    .textFieldStyle(.roundedBorder)
                    .padding(8)
            }

            GroupBox("OpenAI") {
                SecureField("API Key", text: $openaiAPIKey)
                    .textFieldStyle(.roundedBorder)
                    .padding(8)
            }

            Text("API keys are stored in UserDefaults.")
                .font(.caption)
                .foregroundColor(.secondary)

            Spacer()
        }
        .padding(20)
    }

    private var vectorDBSettings: some View {
        VStack(alignment: .leading, spacing: 16) {
            GroupBox("Qdrant Connection") {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Text("Host:")
                            .frame(width: 60, alignment: .leading)
                        TextField("", text: $qdrantHost)
                            .textFieldStyle(.roundedBorder)
                            .frame(width: 150)
                    }

                    HStack {
                        Text("Port:")
                            .frame(width: 60, alignment: .leading)
                        TextField("", value: $qdrantPort, format: .number)
                            .textFieldStyle(.roundedBorder)
                            .frame(width: 80)
                    }

                    HStack {
                        Text("Status:")
                            .frame(width: 60, alignment: .leading)
                        Text(qdrantStatus)
                            .foregroundColor(qdrantStatus == "Connected" ? .green : .orange)
                        Spacer()
                        Button("Check") { checkQdrantStatus() }
                    }
                }
                .padding(8)
            }

            GroupBox("Setup") {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Run Qdrant with Docker:")
                        .font(.caption)
                    Text("docker run -p 6333:6333 qdrant/qdrant")
                        .font(.system(.caption, design: .monospaced))
                        .padding(6)
                        .background(Color.gray.opacity(0.2))
                        .cornerRadius(4)
                        .textSelection(.enabled)
                }
                .padding(8)
            }

            Spacer()
        }
        .padding(20)
    }

    private func checkQdrantStatus() {
        let client = QdrantClient(host: qdrantHost, port: qdrantPort)
        Task {
            let isHealthy = await client.healthCheck()
            await MainActor.run {
                qdrantStatus = isHealthy ? "Connected" : "Not Connected"
            }
        }
    }
}

#Preview {
    SettingsView()
}
