//
//  HTTPServer.swift
//  localbird
//
//  Lightweight HTTP server for IPC with Electron app
//

import Foundation
import Network

/// Simple HTTP server using Network framework
class HTTPServer {
    private var listener: NWListener?
    private let port: UInt16
    private let queue = DispatchQueue(label: "com.localbird.httpserver")

    var onConfigure: ((ServiceConfig) -> Void)?
    var onStartCapture: (() -> Void)?
    var onStopCapture: (() -> Void)?
    var getStatus: (() -> ServiceStatus)?

    init(port: UInt16 = 9111) {
        self.port = port
    }

    func start() throws {
        let parameters = NWParameters.tcp
        parameters.allowLocalEndpointReuse = true

        listener = try NWListener(using: parameters, on: NWEndpoint.Port(rawValue: port)!)

        listener?.stateUpdateHandler = { [weak self] state in
            switch state {
            case .ready:
                NSLog("[HTTPServer] Listening on port %d", self?.port ?? 0)
            case .failed(let error):
                NSLog("[HTTPServer] Failed: %@", error.localizedDescription)
            default:
                break
            }
        }

        listener?.newConnectionHandler = { [weak self] connection in
            self?.handleConnection(connection)
        }

        listener?.start(queue: queue)
    }

    func stop() {
        listener?.cancel()
        listener = nil
    }

    private func handleConnection(_ connection: NWConnection) {
        connection.start(queue: queue)

        connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, isComplete, error in
            guard let self = self, let data = data, !data.isEmpty else {
                connection.cancel()
                return
            }

            let response = self.handleRequest(data)
            self.sendResponse(connection, response: response)
        }
    }

    private func handleRequest(_ data: Data) -> HTTPResponse {
        guard let request = String(data: data, encoding: .utf8) else {
            return HTTPResponse(status: 400, body: ["error": "Invalid request"])
        }

        let lines = request.components(separatedBy: "\r\n")
        guard let requestLine = lines.first else {
            return HTTPResponse(status: 400, body: ["error": "Invalid request"])
        }

        let parts = requestLine.components(separatedBy: " ")
        guard parts.count >= 2 else {
            return HTTPResponse(status: 400, body: ["error": "Invalid request"])
        }

        let method = parts[0]
        let path = parts[1]

        // Extract body for POST requests
        var body: Data?
        if let emptyLineIndex = lines.firstIndex(of: "") {
            let bodyString = lines[(emptyLineIndex + 1)...].joined(separator: "\r\n")
            body = bodyString.data(using: .utf8)
        }

        return routeRequest(method: method, path: path, body: body)
    }

    private func routeRequest(method: String, path: String, body: Data?) -> HTTPResponse {
        switch (method, path) {
        case ("GET", "/status"):
            return handleGetStatus()
        case ("POST", "/capture/start"):
            return handleStartCapture()
        case ("POST", "/capture/stop"):
            return handleStopCapture()
        case ("POST", "/configure"):
            return handleConfigure(body: body)
        case ("GET", "/health"):
            return HTTPResponse(status: 200, body: ["status": "ok"])
        default:
            return HTTPResponse(status: 404, body: ["error": "Not found"])
        }
    }

    private func handleGetStatus() -> HTTPResponse {
        guard let status = getStatus?() else {
            return HTTPResponse(status: 500, body: ["error": "Status unavailable"])
        }

        return HTTPResponse(status: 200, body: [
            "isRunning": status.isRunning,
            "frameCount": status.frameCount,
            "lastCaptureTime": status.lastCaptureTime?.timeIntervalSince1970 as Any,
            "lastError": status.lastError as Any
        ])
    }

    private func handleStartCapture() -> HTTPResponse {
        onStartCapture?()
        return HTTPResponse(status: 200, body: ["success": true])
    }

    private func handleStopCapture() -> HTTPResponse {
        onStopCapture?()
        return HTTPResponse(status: 200, body: ["success": true])
    }

    private func handleConfigure(body: Data?) -> HTTPResponse {
        guard let body = body else {
            return HTTPResponse(status: 400, body: ["error": "Missing body"])
        }

        do {
            let config = try JSONDecoder().decode(ServiceConfig.self, from: body)
            onConfigure?(config)
            return HTTPResponse(status: 200, body: ["success": true])
        } catch {
            return HTTPResponse(status: 400, body: ["error": error.localizedDescription])
        }
    }

    private func sendResponse(_ connection: NWConnection, response: HTTPResponse) {
        let jsonData = try? JSONSerialization.data(withJSONObject: response.body)
        let jsonString = String(data: jsonData ?? Data(), encoding: .utf8) ?? "{}"

        // Build HTTP response with proper CRLF line endings
        let httpResponse = "HTTP/1.1 \(response.status) \(response.statusText)\r\n" +
            "Content-Type: application/json\r\n" +
            "Content-Length: \(jsonString.utf8.count)\r\n" +
            "Access-Control-Allow-Origin: *\r\n" +
            "Connection: close\r\n" +
            "\r\n" +
            jsonString

        connection.send(content: httpResponse.data(using: .utf8), completion: .contentProcessed { _ in
            connection.cancel()
        })
    }
}

// MARK: - Supporting Types

struct HTTPResponse {
    let status: Int
    let body: [String: Any]

    var statusText: String {
        switch status {
        case 200: return "OK"
        case 400: return "Bad Request"
        case 404: return "Not Found"
        case 500: return "Internal Server Error"
        default: return "Unknown"
        }
    }
}

struct ServiceStatus {
    let isRunning: Bool
    let frameCount: Int
    let lastCaptureTime: Date?
    let lastError: String?
}

struct ServiceConfig: Codable {
    let geminiAPIKey: String?
    let claudeAPIKey: String?
    let openaiAPIKey: String?
    let captureInterval: Double?
    let enableFullScreenCaptures: Bool?
    let fullScreenCaptureInterval: Double?
    let activeVisionProvider: String?
    let qdrantHost: String?
    let qdrantPort: Int?
}
