//
//  CapturedFrame.swift
//  localbird
//

import Foundation
import AppKit

/// Reason why a capture was triggered
enum CaptureTrigger: String, Codable {
    case timer           // Regular interval capture
    case appChanged      // Frontmost app changed
    case fullScreen      // Periodic full screen capture for context
    case scroll          // Future: scroll detected
    case manual          // User requested capture
}

/// Metadata about the capture context
struct CaptureMetadata: Codable {
    let trigger: CaptureTrigger
    let appBundleId: String?
    let appName: String?
    let windowTitle: String?
    let windowBounds: CGRect?

    enum CodingKeys: String, CodingKey {
        case trigger, appBundleId, appName, windowTitle, windowBounds
    }

    init(trigger: CaptureTrigger, appBundleId: String?, appName: String?, windowTitle: String?, windowBounds: CGRect?) {
        self.trigger = trigger
        self.appBundleId = appBundleId
        self.appName = appName
        self.windowTitle = windowTitle
        self.windowBounds = windowBounds
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        trigger = try container.decode(CaptureTrigger.self, forKey: .trigger)
        appBundleId = try container.decodeIfPresent(String.self, forKey: .appBundleId)
        appName = try container.decodeIfPresent(String.self, forKey: .appName)
        windowTitle = try container.decodeIfPresent(String.self, forKey: .windowTitle)

        if let boundsDict = try container.decodeIfPresent([String: CGFloat].self, forKey: .windowBounds) {
            windowBounds = CGRect(
                x: boundsDict["x"] ?? 0,
                y: boundsDict["y"] ?? 0,
                width: boundsDict["width"] ?? 0,
                height: boundsDict["height"] ?? 0
            )
        } else {
            windowBounds = nil
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(trigger, forKey: .trigger)
        try container.encodeIfPresent(appBundleId, forKey: .appBundleId)
        try container.encodeIfPresent(appName, forKey: .appName)
        try container.encodeIfPresent(windowTitle, forKey: .windowTitle)

        if let bounds = windowBounds {
            let boundsDict: [String: CGFloat] = [
                "x": bounds.origin.x,
                "y": bounds.origin.y,
                "width": bounds.size.width,
                "height": bounds.size.height
            ]
            try container.encode(boundsDict, forKey: .windowBounds)
        }
    }
}

/// Represents a single captured frame with its associated data
struct CapturedFrame: Identifiable, Codable {
    let id: UUID
    let timestamp: Date
    let imageData: Data
    let accessibilityData: AccessibilitySnapshot?
    var llmAnalysis: FrameAnalysis?
    var embedding: [Float]?
    var captureMetadata: CaptureMetadata?

    init(
        id: UUID = UUID(),
        timestamp: Date = Date(),
        imageData: Data,
        accessibilityData: AccessibilitySnapshot? = nil,
        llmAnalysis: FrameAnalysis? = nil,
        embedding: [Float]? = nil,
        captureMetadata: CaptureMetadata? = nil
    ) {
        self.id = id
        self.timestamp = timestamp
        self.imageData = imageData
        self.accessibilityData = accessibilityData
        self.llmAnalysis = llmAnalysis
        self.embedding = embedding
        self.captureMetadata = captureMetadata
    }
}

/// Snapshot of accessibility tree at capture time
struct AccessibilitySnapshot: Codable {
    let focusedApp: String?
    let focusedWindow: String?
    let elements: [AccessibilityElement]
}

/// Simplified accessibility element representation
struct AccessibilityElement: Codable {
    let role: String
    let title: String?
    let value: String?
    let frame: CGRect?
    let children: [AccessibilityElement]?

    enum CodingKeys: String, CodingKey {
        case role, title, value, frame, children
    }

    init(role: String, title: String?, value: String?, frame: CGRect?, children: [AccessibilityElement]?) {
        self.role = role
        self.title = title
        self.value = value
        self.frame = frame
        self.children = children
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        role = try container.decode(String.self, forKey: .role)
        title = try container.decodeIfPresent(String.self, forKey: .title)
        value = try container.decodeIfPresent(String.self, forKey: .value)
        children = try container.decodeIfPresent([AccessibilityElement].self, forKey: .children)

        if let frameDict = try container.decodeIfPresent([String: CGFloat].self, forKey: .frame) {
            frame = CGRect(
                x: frameDict["x"] ?? 0,
                y: frameDict["y"] ?? 0,
                width: frameDict["width"] ?? 0,
                height: frameDict["height"] ?? 0
            )
        } else {
            frame = nil
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(role, forKey: .role)
        try container.encodeIfPresent(title, forKey: .title)
        try container.encodeIfPresent(value, forKey: .value)
        try container.encodeIfPresent(children, forKey: .children)

        if let frame = frame {
            let frameDict: [String: CGFloat] = [
                "x": frame.origin.x,
                "y": frame.origin.y,
                "width": frame.size.width,
                "height": frame.size.height
            ]
            try container.encode(frameDict, forKey: .frame)
        }
    }
}

/// Structured analysis from LLM
struct FrameAnalysis: Codable {
    let summary: String
    let activeApplication: String?
    let userActivity: String?
    let visibleText: [String]
    let uiElements: [String]
    let metadata: [String: String]
}
