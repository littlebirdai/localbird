//
//  localbirdApp.swift
//  localbird
//
//  Created by Alexander Green on 11/30/25.
//

import SwiftUI

@main
struct localbirdApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        Settings {
            SettingsView()
        }
    }
}

class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem?
    private var popover: NSPopover?
    private let coordinator = CaptureCoordinator()
    private var captureMenuItem: NSMenuItem?

    func applicationDidFinishLaunching(_ notification: Notification) {
        setupMenuBar()
        configureCoordinator()
    }

    private func setupMenuBar() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)

        if let button = statusItem?.button {
            button.image = NSImage(systemSymbolName: "bird.fill", accessibilityDescription: "Localbird")
            button.action = #selector(togglePopover)
            button.target = self
        }

        // Setup popover for status view
        popover = NSPopover()
        popover?.contentSize = NSSize(width: 280, height: 220)
        popover?.behavior = .transient
        popover?.contentViewController = NSHostingController(rootView: ContentView(coordinator: coordinator))

        // Setup right-click menu
        let menu = NSMenu()

        captureMenuItem = NSMenuItem(title: "Start Capture", action: #selector(toggleCapture), keyEquivalent: "")
        captureMenuItem?.target = self
        menu.addItem(captureMenuItem!)

        menu.addItem(NSMenuItem.separator())

        let settingsItem = NSMenuItem(title: "Settings...", action: #selector(openSettings), keyEquivalent: ",")
        settingsItem.target = self
        menu.addItem(settingsItem)

        menu.addItem(NSMenuItem.separator())

        let quitItem = NSMenuItem(title: "Quit Localbird", action: #selector(quit), keyEquivalent: "q")
        quitItem.target = self
        menu.addItem(quitItem)

        statusItem?.menu = menu
    }

    private func configureCoordinator() {
        let settings = AppSettings.fromUserDefaults()
        coordinator.configure(settings: settings)
    }

    @objc private func togglePopover() {
        guard let button = statusItem?.button else { return }

        if let popover = popover {
            if popover.isShown {
                popover.performClose(nil)
            } else {
                popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
            }
        }
    }

    @objc private func toggleCapture() {
        if coordinator.isRunning {
            coordinator.stopCapture()
            captureMenuItem?.title = "Start Capture"
            updateMenuBarIcon(capturing: false)
        } else {
            Task { @MainActor in
                configureCoordinator()
                await coordinator.startCapture()
                captureMenuItem?.title = "Stop Capture"
                updateMenuBarIcon(capturing: true)
            }
        }
    }

    private func updateMenuBarIcon(capturing: Bool) {
        if let button = statusItem?.button {
            let symbolName = capturing ? "bird.fill" : "bird"
            button.image = NSImage(systemSymbolName: symbolName, accessibilityDescription: "Localbird")

            // Add a subtle indicator when capturing
            if capturing {
                button.image?.isTemplate = false
            } else {
                button.image?.isTemplate = true
            }
        }
    }

    @objc private func openSettings() {
        NSApp.sendAction(Selector(("showSettingsWindow:")), to: nil, from: nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    @objc private func quit() {
        coordinator.stopCapture()
        NSApplication.shared.terminate(nil)
    }
}
