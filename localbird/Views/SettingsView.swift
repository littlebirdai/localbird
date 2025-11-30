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
    @AppStorage("qdrantHost") private var qdrantHost = "localhost"
    @AppStorage("qdrantPort") private var qdrantPort = 6333
    @AppStorage("activeVisionProvider") private var activeVisionProvider = "gemini"

    @State private var showingAPIKeys = false
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
        .frame(width: 500, height: 400)
        .onAppear {
            checkQdrantStatus()
        }
    }

    private var generalSettings: some View {
        Form {
            Section("Capture Settings") {
                HStack {
                    Text("Capture Interval")
                    Spacer()
                    TextField("Seconds", value: $captureInterval, format: .number)
                        .frame(width: 60)
                    Text("seconds")
                }

                Picker("Vision Provider", selection: $activeVisionProvider) {
                    Text("Gemini").tag("gemini")
                    Text("Claude").tag("claude")
                    Text("OpenAI").tag("openai")
                }
            }

            Section("Permissions") {
                HStack {
                    Text("Screen Recording")
                    Spacer()
                    Button("Request") {
                        Task {
                            await ScreenCaptureService.requestPermission()
                        }
                    }
                }

                HStack {
                    Text("Accessibility")
                    Spacer()
                    Button("Request") {
                        AccessibilityService.requestPermission()
                    }
                }
            }
        }
        .padding()
    }

    private var apiSettings: some View {
        Form {
            Section("Gemini (Recommended for Vision)") {
                SecureField("API Key", text: $geminiAPIKey)
                    .textFieldStyle(.roundedBorder)
            }

            Section("Claude") {
                SecureField("API Key", text: $claudeAPIKey)
                    .textFieldStyle(.roundedBorder)
            }

            Section("OpenAI") {
                SecureField("API Key", text: $openaiAPIKey)
                    .textFieldStyle(.roundedBorder)
            }

            Section {
                Text("API keys are stored in UserDefaults. For production, consider using Keychain.")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .padding()
    }

    private var vectorDBSettings: some View {
        Form {
            Section("Qdrant Connection") {
                HStack {
                    Text("Host")
                    Spacer()
                    TextField("Host", text: $qdrantHost)
                        .frame(width: 150)
                        .textFieldStyle(.roundedBorder)
                }

                HStack {
                    Text("Port")
                    Spacer()
                    TextField("Port", value: $qdrantPort, format: .number)
                        .frame(width: 80)
                        .textFieldStyle(.roundedBorder)
                }

                HStack {
                    Text("Status")
                    Spacer()
                    Text(qdrantStatus)
                        .foregroundColor(qdrantStatus == "Connected" ? .green : .red)
                    Button("Check") {
                        checkQdrantStatus()
                    }
                }
            }

            Section("Setup Instructions") {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Install Qdrant locally:")
                        .fontWeight(.medium)
                    Text("docker run -p 6333:6333 qdrant/qdrant")
                        .font(.system(.caption, design: .monospaced))
                        .padding(8)
                        .background(Color.gray.opacity(0.2))
                        .cornerRadius(4)

                    Text("Or install via Homebrew:")
                        .fontWeight(.medium)
                    Text("brew install qdrant/tap/qdrant")
                        .font(.system(.caption, design: .monospaced))
                        .padding(8)
                        .background(Color.gray.opacity(0.2))
                        .cornerRadius(4)
                }
            }
        }
        .padding()
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
