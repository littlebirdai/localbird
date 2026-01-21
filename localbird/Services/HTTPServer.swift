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

    // Meeting callbacks - called from Task { @MainActor in } so must be @MainActor
    var onStartMeeting: (@MainActor (String) async throws -> MeetingNote)?
    var onStopMeeting: (@MainActor () async throws -> MeetingNote)?
    var onCancelMeeting: (@MainActor () -> Void)?
    var getMeetingStatus: (@MainActor () -> MeetingStatus)?
    var getMeetings: (@MainActor () -> [MeetingNote])?
    var getMeeting: (@MainActor (UUID) -> MeetingNote?)?
    var deleteMeeting: (@MainActor (UUID) -> Void)?

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
            NSLog("[HTTPServer] handleConnection: received data, isComplete=%d, error=%@", isComplete, error?.localizedDescription ?? "none")
            guard let self = self, let data = data, !data.isEmpty else {
                NSLog("[HTTPServer] handleConnection: no data, cancelling connection")
                connection.cancel()
                return
            }

            NSLog("[HTTPServer] handleConnection: calling handleRequest")
            let response = self.handleRequest(data)
            NSLog("[HTTPServer] handleConnection: handleRequest returned, status=%d, now calling sendResponse", response.status)
            NSLog("[HTTPServer] handleConnection: connection state before send = %@", String(describing: connection.state))
            self.sendResponse(connection, response: response)
            NSLog("[HTTPServer] handleConnection: sendResponse called")
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
        // Handle path with parameters (e.g., /meeting/:id)
        let pathComponents = path.split(separator: "/").map(String.init)

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

        // Meeting endpoints
        case ("POST", "/meeting/start"):
            return handleStartMeeting(body: body)
        case ("POST", "/meeting/stop"):
            return handleStopMeeting()
        case ("POST", "/meeting/cancel"):
            return handleCancelMeeting()
        case ("GET", "/meeting/status"):
            return handleGetMeetingStatus()
        case ("GET", "/meetings"):
            return handleGetMeetings()

        default:
            // Check for parameterized routes
            if method == "GET" && pathComponents.count == 2 && pathComponents[0] == "meeting" {
                if let id = UUID(uuidString: pathComponents[1]) {
                    return handleGetMeeting(id: id)
                }
            }
            if method == "DELETE" && pathComponents.count == 2 && pathComponents[0] == "meeting" {
                if let id = UUID(uuidString: pathComponents[1]) {
                    return handleDeleteMeeting(id: id)
                }
            }

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

    // MARK: - Meeting Handlers

    private func handleStartMeeting(body: Data?) -> HTTPResponse {
        // This returns immediately - actual async work happens in handleStartMeetingAsync
        // Parse optional title from body
        var title = "Meeting"
        if let body = body {
            NSLog("[HTTPServer] handleStartMeeting: body length=%d, content=%@", body.count, String(data: body, encoding: .utf8) ?? "nil")
            if let json = try? JSONSerialization.jsonObject(with: body) as? [String: Any] {
                NSLog("[HTTPServer] handleStartMeeting: parsed JSON with %d keys", json.count)
                if let parsedTitle = json["title"] as? String {
                    title = parsedTitle
                    NSLog("[HTTPServer] handleStartMeeting: parsed title='%@'", title)
                }
            }
        } else {
            NSLog("[HTTPServer] handleStartMeeting: no body provided")
        }

        guard let onStartMeeting = onStartMeeting else {
            return HTTPResponse(status: 500, body: ["error": "Meeting service not available"])
        }

        // Use a mutable result box that can be modified from the async closure
        class ResultBox: @unchecked Sendable {
            var result: HTTPResponse = HTTPResponse(status: 500, body: ["error": "Timeout"])
        }
        let box = ResultBox()
        let semaphore = DispatchSemaphore(value: 0)

        NSLog("[HTTPServer] handleStartMeeting: starting async task with title='%@'", title)

        // Schedule the async work on the main actor to properly access MeetingCoordinator
        Task { @MainActor in
            NSLog("[HTTPServer] handleStartMeeting: MainActor task started")
            do {
                NSLog("[HTTPServer] handleStartMeeting: calling callback...")
                let meeting = try await onStartMeeting(title)
                NSLog("[HTTPServer] handleStartMeeting: callback returned with meeting title='%@'", meeting.title)
                box.result = HTTPResponse(status: 200, body: [
                    "success": true,
                    "meetingId": meeting.id.uuidString,
                    "title": meeting.title,
                    "startTime": meeting.startTime.timeIntervalSince1970
                ])
            } catch {
                NSLog("[HTTPServer] handleStartMeeting: error: %@", error.localizedDescription)
                box.result = HTTPResponse(status: 400, body: ["error": error.localizedDescription])
            }
            NSLog("[HTTPServer] handleStartMeeting: signaling semaphore")
            semaphore.signal()
        }

        NSLog("[HTTPServer] handleStartMeeting: waiting on semaphore")
        let waitResult = semaphore.wait(timeout: .now() + 30)
        NSLog("[HTTPServer] handleStartMeeting: wait result: %@", waitResult == .success ? "success" : "timedOut")
        return box.result
    }

    private func handleStopMeeting() -> HTTPResponse {
        guard let onStopMeeting = onStopMeeting else {
            return HTTPResponse(status: 500, body: ["error": "Meeting service not available"])
        }

        class ResultBox: @unchecked Sendable {
            var result: HTTPResponse = HTTPResponse(status: 500, body: ["error": "Timeout"])
        }
        let box = ResultBox()
        let semaphore = DispatchSemaphore(value: 0)

        NSLog("[HTTPServer] handleStopMeeting: starting async task")

        Task { @MainActor in
            NSLog("[HTTPServer] handleStopMeeting: MainActor task started")
            do {
                let meeting = try await onStopMeeting()
                NSLog("[HTTPServer] handleStopMeeting: callback returned with meeting title='%@'", meeting.title)
                box.result = HTTPResponse(status: 200, body: [
                    "success": true,
                    "meetingId": meeting.id.uuidString,
                    "title": meeting.title,
                    "duration": meeting.duration,
                    "transcript": meeting.transcript,
                    "segmentCount": meeting.segments.count
                ])
            } catch {
                NSLog("[HTTPServer] handleStopMeeting: error: %@", error.localizedDescription)
                box.result = HTTPResponse(status: 400, body: ["error": error.localizedDescription])
            }
            semaphore.signal()
        }

        _ = semaphore.wait(timeout: .now() + 60) // Longer timeout for transcription
        return box.result
    }

    private func handleCancelMeeting() -> HTTPResponse {
        guard let onCancelMeeting = onCancelMeeting else {
            return HTTPResponse(status: 500, body: ["error": "Meeting service not available"])
        }
        let semaphore = DispatchSemaphore(value: 0)
        Task { @MainActor in
            onCancelMeeting()
            semaphore.signal()
        }
        _ = semaphore.wait(timeout: .now() + 5)
        return HTTPResponse(status: 200, body: ["success": true])
    }

    private func handleGetMeetingStatus() -> HTTPResponse {
        guard let getMeetingStatus = getMeetingStatus else {
            return HTTPResponse(status: 500, body: ["error": "Meeting status unavailable"])
        }

        class ResultBox: @unchecked Sendable {
            var status: MeetingStatus?
        }
        let box = ResultBox()
        let semaphore = DispatchSemaphore(value: 0)

        Task { @MainActor in
            box.status = getMeetingStatus()
            semaphore.signal()
        }

        _ = semaphore.wait(timeout: .now() + 5)

        guard let status = box.status else {
            return HTTPResponse(status: 500, body: ["error": "Meeting status unavailable"])
        }

        return HTTPResponse(status: 200, body: [
            "state": status.state.rawValue,
            "currentMeetingId": status.currentMeetingId?.uuidString as Any,
            "duration": status.duration,
            "liveTranscript": status.liveTranscript,
            "error": status.error as Any
        ])
    }

    private func handleGetMeetings() -> HTTPResponse {
        guard let getMeetings = getMeetings else {
            return HTTPResponse(status: 500, body: ["error": "Meetings unavailable"])
        }

        class ResultBox: @unchecked Sendable {
            var meetings: [MeetingNote]?
        }
        let box = ResultBox()
        let semaphore = DispatchSemaphore(value: 0)

        Task { @MainActor in
            box.meetings = getMeetings()
            semaphore.signal()
        }

        _ = semaphore.wait(timeout: .now() + 5)

        guard let meetings = box.meetings else {
            return HTTPResponse(status: 500, body: ["error": "Meetings unavailable"])
        }

        let meetingsList = meetings.map { meeting -> [String: Any] in
            [
                "id": meeting.id.uuidString,
                "title": meeting.title,
                "startTime": meeting.startTime.timeIntervalSince1970,
                "endTime": meeting.endTime?.timeIntervalSince1970 as Any,
                "duration": meeting.duration,
                "transcriptPreview": String(meeting.transcript.prefix(100))
            ]
        }

        return HTTPResponse(status: 200, body: ["meetings": meetingsList])
    }

    private func handleGetMeeting(id: UUID) -> HTTPResponse {
        guard let getMeeting = getMeeting else {
            return HTTPResponse(status: 404, body: ["error": "Meeting not found"])
        }

        class ResultBox: @unchecked Sendable {
            var meeting: MeetingNote?
        }
        let box = ResultBox()
        let semaphore = DispatchSemaphore(value: 0)

        Task { @MainActor in
            box.meeting = getMeeting(id)
            semaphore.signal()
        }

        _ = semaphore.wait(timeout: .now() + 5)

        guard let meeting = box.meeting else {
            return HTTPResponse(status: 404, body: ["error": "Meeting not found"])
        }

        let segmentsList = meeting.segments.map { segment -> [String: Any] in
            [
                "startTime": segment.startTime,
                "endTime": segment.endTime,
                "text": segment.text
            ]
        }

        return HTTPResponse(status: 200, body: [
            "id": meeting.id.uuidString,
            "title": meeting.title,
            "startTime": meeting.startTime.timeIntervalSince1970,
            "endTime": meeting.endTime?.timeIntervalSince1970 as Any,
            "duration": meeting.duration,
            "transcript": meeting.transcript,
            "segments": segmentsList,
            "audioPath": meeting.audioPath as Any
        ])
    }

    private func handleDeleteMeeting(id: UUID) -> HTTPResponse {
        guard let deleteMeeting = deleteMeeting else {
            return HTTPResponse(status: 500, body: ["error": "Meeting service not available"])
        }
        let semaphore = DispatchSemaphore(value: 0)
        Task { @MainActor in
            deleteMeeting(id)
            semaphore.signal()
        }
        _ = semaphore.wait(timeout: .now() + 5)
        return HTTPResponse(status: 200, body: ["success": true])
    }

    private func sendResponse(_ connection: NWConnection, response: HTTPResponse) {
        NSLog("[HTTPServer] sendResponse: status=%d", response.status)

        // Log all keys and types first for debugging
        NSLog("[HTTPServer] sendResponse: body has %d keys", response.body.count)
        for (key, value) in response.body {
            NSLog("[HTTPServer] sendResponse: key=%@, valueType=%@", key, String(describing: type(of: value)))
        }

        // Build safe JSON manually
        var safeBody: [String: Any] = [:]
        for (key, value) in response.body {
            if let str = value as? String {
                safeBody[key] = str
            } else if let num = value as? NSNumber {
                safeBody[key] = num
            } else if let bool = value as? Bool {
                safeBody[key] = bool
            } else if let int = value as? Int {
                safeBody[key] = int
            } else if let double = value as? Double {
                safeBody[key] = double
            } else if let arr = value as? [Any] {
                safeBody[key] = arr
            } else if let dict = value as? [String: Any] {
                safeBody[key] = dict
            } else {
                // Convert non-serializable to string
                safeBody[key] = String(describing: value)
                NSLog("[HTTPServer] sendResponse: WARNING - converted %@ to string", key)
            }
        }

        var jsonString = "{}"
        do {
            let jsonData = try JSONSerialization.data(withJSONObject: safeBody)
            jsonString = String(data: jsonData, encoding: .utf8) ?? "{}"
        } catch {
            NSLog("[HTTPServer] sendResponse: JSON serialization error: %@", error.localizedDescription)
            jsonString = "{\"error\":\"Internal serialization error\"}"
        }
        NSLog("[HTTPServer] sendResponse: jsonString length=%d, content=%@", jsonString.count, jsonString)

        // Build HTTP response with proper CRLF line endings
        let httpResponse = "HTTP/1.1 \(response.status) \(response.statusText)\r\n" +
            "Content-Type: application/json\r\n" +
            "Content-Length: \(jsonString.utf8.count)\r\n" +
            "Access-Control-Allow-Origin: *\r\n" +
            "Connection: close\r\n" +
            "\r\n" +
            jsonString

        NSLog("[HTTPServer] sendResponse: sending response")
        connection.send(content: httpResponse.data(using: .utf8), completion: .contentProcessed { error in
            NSLog("[HTTPServer] sendResponse: send completed, error=%@", error?.localizedDescription ?? "none")
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
