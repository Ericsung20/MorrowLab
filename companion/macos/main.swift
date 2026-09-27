import AppKit
import ApplicationServices
import Network

private let companionVersion = "0.1.0"
private func json(_ value: Any) -> String {
    guard let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]),
          let string = String(data: data, encoding: .utf8) else { return "null" }
    return string
}
private func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
    var value: CFTypeRef?
    return AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success ? value : nil
}
private func permissionStatus() -> [String: Any] {
    ["app": "MorrowLab Companion", "version": companionVersion, "kind": "native",
     "accessibility": AXIsProcessTrusted(), "screenRecording": CGPreflightScreenCaptureAccess()]
}
private func foregroundWindow() -> String {
    guard let app = NSWorkspace.shared.frontmostApplication else { return "null" }
    var result = ["app": app.localizedName ?? app.bundleIdentifier ?? "Unknown app", "title": ""]
    if CGPreflightScreenCaptureAccess(),
       let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]],
       let window = windows.first(where: { ($0[kCGWindowOwnerPID as String] as? Int32) == app.processIdentifier && ($0[kCGWindowLayer as String] as? Int) == 0 }) {
        result["title"] = window[kCGWindowName as String] as? String ?? ""
    }
    if AXIsProcessTrusted() {
        let element = AXUIElementCreateApplication(app.processIdentifier)
        AXUIElementSetMessagingTimeout(element, 0.2)
        if let value = attribute(element, kAXFocusedWindowAttribute), CFGetTypeID(value) == AXUIElementGetTypeID() {
            let window = unsafeBitCast(value, to: AXUIElement.self)
            if result["title"] == "" { result["title"] = attribute(window, kAXTitleAttribute) as? String ?? "" }
            // Safari and Chromium expose the current document URL on the focused window.
            // Unsupported browsers fall back to their window title; never crawl page contents.
            if let document = attribute(window, kAXDocumentAttribute) as? String,
               let url = URL(string: document), ["http", "https"].contains(url.scheme ?? "") {
                result["url"] = document
            }
        }
    }
    return json(result)
}


final class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem!
    private var window: NSWindow!
    private let accessibility = NSTextField(labelWithString: "")
    private let screen = NSTextField(labelWithString: "")
    private let connection = NSTextField(wrappingLabelWithString: "Starting local connection…")
    private let activity = NSTextField(labelWithString: "")
    private let server = CompanionServer(status: { json(permissionStatus()) }, foreground: foregroundWindow)
    private var timer: Timer?
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let path = Bundle.main.path(forResource: "morrowlab-mark", ofType: "png"), let mark = NSImage(contentsOfFile: path) {
            mark.size = NSSize(width: 22, height: 22)
            statusItem.button?.image = mark
        } else { statusItem.button?.title = "ML" }
        statusItem.button?.toolTip = "MorrowLab Companion"
        let menu = NSMenu()
        menu.addItem(withTitle: "Set up MorrowLab Companion…", action: #selector(showSetup), keyEquivalent: "")
        menu.addItem(.separator())
        menu.addItem(withTitle: "Quit Companion", action: #selector(quit), keyEquivalent: "q")
        for item in menu.items { item.target = self }
        statusItem.menu = menu
        buildWindow()
        server.onState = { [weak self] message in self?.connection.stringValue = message }
        server.start()
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            self?.refresh(); self?.server.tick()
        }
        refresh(); showSetup()
    }
    private func buildWindow() {
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 530, height: 600), styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
        window.title = "MorrowLab Companion"
        window.isReleasedWhenClosed = false
        window.center()
        let stack = NSStackView()
        stack.orientation = .vertical; stack.alignment = .leading; stack.spacing = 16
        stack.translatesAutoresizingMaskIntoConstraints = false
        let heading = NSTextField(labelWithString: "A little help for focused study.")
        heading.font = .systemFont(ofSize: 24, weight: .semibold)
        stack.addArrangedSubview(heading)
        let intro = NSTextField(wrappingLabelWithString: "Connect Safari and your other Mac apps to MorrowLab. Allow these permissions once for MorrowLab Companion — no Terminal needed.")
        stack.addArrangedSubview(intro)
        stack.addArrangedSubview(accessibility)
        stack.addArrangedSubview(button("Allow Accessibility…", #selector(allowAccessibility)))
        stack.addArrangedSubview(screen)
        stack.addArrangedSubview(button("Allow Screen Recording…", #selector(allowScreen)))
        stack.addArrangedSubview(connection)
        stack.addArrangedSubview(activity)
        let footer = NSTextField(wrappingLabelWithString: "Only the foreground app, window title and available browser URL are shared with local MorrowLab pages during study sessions. No screenshots, audio or keystrokes are collected.\n\nIf macOS asks you to quit after granting permission, quit from the mascot menu and reopen the app. Closing this window keeps the companion running.")
        footer.font = .systemFont(ofSize: 12); footer.textColor = .secondaryLabelColor
        stack.addArrangedSubview(footer)
        window.contentView!.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: window.contentView!.leadingAnchor, constant: 28),
            stack.trailingAnchor.constraint(equalTo: window.contentView!.trailingAnchor, constant: -28),
            stack.topAnchor.constraint(equalTo: window.contentView!.topAnchor, constant: 28),
            stack.bottomAnchor.constraint(lessThanOrEqualTo: window.contentView!.bottomAnchor, constant: -20)
        ])
        for view in [intro, connection, footer] { view.widthAnchor.constraint(equalTo: stack.widthAnchor).isActive = true }
    }
    private func button(_ title: String, _ action: Selector) -> NSButton {
        let button = NSButton(title: title, target: self, action: action)
        button.bezelStyle = .rounded
        return button
    }
    private func refresh() {
        accessibility.stringValue = "\(AXIsProcessTrusted() ? "✓" : "○") Accessibility · browser URLs"
        screen.stringValue = "\(CGPreflightScreenCaptureAccess() ? "✓" : "○") Screen Recording · window titles"
        activity.stringValue = server.activeSessions > 0 ? "Connected to \(server.activeSessions) study session(s)" : "Idle · no window information is being collected"
    }
    @objc private func showSetup() { NSApp.activate(ignoringOtherApps: true); window.makeKeyAndOrderFront(nil) }
    @objc private func allowAccessibility() {
        _ = AXIsProcessTrustedWithOptions([kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary)
        openSettings("Privacy_Accessibility")
    }
    @objc private func allowScreen() { _ = CGRequestScreenCaptureAccess(); openSettings("Privacy_ScreenCapture") }
    private func openSettings(_ pane: String) {
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?\(pane)") { NSWorkspace.shared.open(url) }
    }
    @objc private func quit() { NSApp.terminate(nil) }
    func application(_ application: NSApplication, open urls: [URL]) {
        if urls.contains(where: { $0.scheme == "morrowlab-companion" && $0.host == "setup" }) { showSetup() }
    }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool { showSetup(); return true }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
