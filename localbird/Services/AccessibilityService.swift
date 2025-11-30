//
//  AccessibilityService.swift
//  localbird
//

import Foundation
import AppKit
import ApplicationServices

/// Service for extracting accessibility information from the current UI
class AccessibilityService {

    /// Check if accessibility permissions are granted
    static func checkPermission() -> Bool {
        let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
        return AXIsProcessTrustedWithOptions(options)
    }

    /// Request accessibility permission (shows system dialog)
    static func requestPermission() {
        let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
        _ = AXIsProcessTrustedWithOptions(options)
    }

    /// Capture current accessibility snapshot
    func captureSnapshot() -> AccessibilitySnapshot? {
        guard AccessibilityService.checkPermission() else {
            print("Accessibility permission not granted")
            return nil
        }

        let focusedApp = NSWorkspace.shared.frontmostApplication
        let appName = focusedApp?.localizedName

        var windowTitle: String?
        var elements: [AccessibilityElement] = []

        if let pid = focusedApp?.processIdentifier {
            let appElement = AXUIElementCreateApplication(pid)

            // Get focused window title
            windowTitle = getWindowTitle(from: appElement)

            // Get UI element tree (limited depth to avoid performance issues)
            if let windowElement = getFocusedWindow(from: appElement) {
                elements = extractElements(from: windowElement, maxDepth: 4)
            }
        }

        return AccessibilitySnapshot(
            focusedApp: appName,
            focusedWindow: windowTitle,
            elements: elements
        )
    }

    /// Extract text content from current screen
    func extractVisibleText() -> [String] {
        guard AccessibilityService.checkPermission() else { return [] }

        var texts: [String] = []
        let focusedApp = NSWorkspace.shared.frontmostApplication

        if let pid = focusedApp?.processIdentifier {
            let appElement = AXUIElementCreateApplication(pid)

            if let windowElement = getFocusedWindow(from: appElement) {
                collectTextContent(from: windowElement, into: &texts, maxDepth: 6)
            }
        }

        return texts
    }

    // MARK: - Private Helpers

    private func getWindowTitle(from appElement: AXUIElement) -> String? {
        var windowsRef: CFTypeRef?
        let result = AXUIElementCopyAttributeValue(appElement, kAXWindowsAttribute as CFString, &windowsRef)

        guard result == .success,
              let windows = windowsRef as? [AXUIElement],
              let firstWindow = windows.first else {
            return nil
        }

        var titleRef: CFTypeRef?
        AXUIElementCopyAttributeValue(firstWindow, kAXTitleAttribute as CFString, &titleRef)
        return titleRef as? String
    }

    private func getFocusedWindow(from appElement: AXUIElement) -> AXUIElement? {
        var windowRef: CFTypeRef?
        let result = AXUIElementCopyAttributeValue(appElement, kAXFocusedWindowAttribute as CFString, &windowRef)

        if result == .success {
            return (windowRef as! AXUIElement)
        }

        // Fallback to first window
        var windowsRef: CFTypeRef?
        let windowsResult = AXUIElementCopyAttributeValue(appElement, kAXWindowsAttribute as CFString, &windowsRef)

        if windowsResult == .success, let windows = windowsRef as? [AXUIElement], let first = windows.first {
            return first
        }

        return nil
    }

    private func extractElements(from element: AXUIElement, maxDepth: Int, currentDepth: Int = 0) -> [AccessibilityElement] {
        guard currentDepth < maxDepth else { return [] }

        var elements: [AccessibilityElement] = []

        // Get role
        var roleRef: CFTypeRef?
        AXUIElementCopyAttributeValue(element, kAXRoleAttribute as CFString, &roleRef)
        let role = roleRef as? String ?? "Unknown"

        // Get title
        var titleRef: CFTypeRef?
        AXUIElementCopyAttributeValue(element, kAXTitleAttribute as CFString, &titleRef)
        let title = titleRef as? String

        // Get value
        var valueRef: CFTypeRef?
        AXUIElementCopyAttributeValue(element, kAXValueAttribute as CFString, &valueRef)
        let value = valueRef as? String

        // Get frame
        var positionRef: CFTypeRef?
        var sizeRef: CFTypeRef?
        AXUIElementCopyAttributeValue(element, kAXPositionAttribute as CFString, &positionRef)
        AXUIElementCopyAttributeValue(element, kAXSizeAttribute as CFString, &sizeRef)

        var frame: CGRect?
        if let positionValue = positionRef {
            var position = CGPoint.zero
            AXValueGetValue(positionValue as! AXValue, .cgPoint, &position)

            if let sizeValue = sizeRef {
                var size = CGSize.zero
                AXValueGetValue(sizeValue as! AXValue, .cgSize, &size)
                frame = CGRect(origin: position, size: size)
            }
        }

        // Get children
        var childrenRef: CFTypeRef?
        AXUIElementCopyAttributeValue(element, kAXChildrenAttribute as CFString, &childrenRef)

        var children: [AccessibilityElement]?
        if let axChildren = childrenRef as? [AXUIElement], !axChildren.isEmpty {
            children = axChildren.flatMap { extractElements(from: $0, maxDepth: maxDepth, currentDepth: currentDepth + 1) }
        }

        // Only include elements with meaningful content
        if title != nil || value != nil || role == "AXButton" || role == "AXTextField" || role == "AXStaticText" {
            elements.append(AccessibilityElement(
                role: role,
                title: title,
                value: value,
                frame: frame,
                children: children
            ))
        } else if let children = children {
            // If this element has no content, promote children
            elements.append(contentsOf: children)
        }

        return elements
    }

    private func collectTextContent(from element: AXUIElement, into texts: inout [String], maxDepth: Int, currentDepth: Int = 0) {
        guard currentDepth < maxDepth else { return }

        // Get value (for text fields, static text, etc.)
        var valueRef: CFTypeRef?
        AXUIElementCopyAttributeValue(element, kAXValueAttribute as CFString, &valueRef)
        if let value = valueRef as? String, !value.isEmpty {
            texts.append(value)
        }

        // Get title
        var titleRef: CFTypeRef?
        AXUIElementCopyAttributeValue(element, kAXTitleAttribute as CFString, &titleRef)
        if let title = titleRef as? String, !title.isEmpty {
            texts.append(title)
        }

        // Recurse into children
        var childrenRef: CFTypeRef?
        AXUIElementCopyAttributeValue(element, kAXChildrenAttribute as CFString, &childrenRef)

        if let children = childrenRef as? [AXUIElement] {
            for child in children {
                collectTextContent(from: child, into: &texts, maxDepth: maxDepth, currentDepth: currentDepth + 1)
            }
        }
    }
}
