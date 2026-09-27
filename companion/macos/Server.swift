import Foundation
import Network

final class CompanionServer {
    private let status: () -> String
    private let foreground: () -> String
    init(status: @escaping () -> String, foreground: @escaping () -> String) {
        self.status = status; self.foreground = foreground
    }
    private var listener: NWListener?
    private var clients: [UUID: NWConnection] = [:]
    private var connections: [UUID: NWConnection] = [:]
    var onState: ((String) -> Void)?
    var activeSessions: Int { clients.count }
    func start() {
        do {
            let parameters = NWParameters.tcp
            parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: 47615)
            let listener = try NWListener(using: parameters)
            self.listener = listener
            listener.stateUpdateHandler = { [weak self] state in
                switch state {
                case .ready: self?.onState?("Ready — open MorrowLab to begin a session.")
                case .failed: self?.onState?("Cannot connect: another companion may be running. Quit it, then reopen this app.")
                default: break
                }
            }
            listener.newConnectionHandler = { [weak self] connection in self?.accept(connection) }
            listener.start(queue: .main)
        } catch { onState?("Could not start the local connection. Quit and reopen this app.") }
    }
    private func remove(_ id: UUID) {
        clients.removeValue(forKey: id)
        connections.removeValue(forKey: id)?.cancel()
    }
    private func accept(_ connection: NWConnection) {
        guard connections.count < 32 else { connection.cancel(); return }
        let id = UUID()
        connections[id] = connection
        connection.stateUpdateHandler = { [weak self] state in
            switch state { case .failed, .cancelled: self?.remove(id); default: break }
        }
        connection.start(queue: .main)
        readHeader(connection, id: id, buffer: Data())
        DispatchQueue.main.asyncAfter(deadline: .now() + 5) { [weak self] in
            if self?.clients[id] == nil { self?.remove(id) }
        }
    }
    private func readHeader(_ connection: NWConnection, id: UUID, buffer: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 8192) { [weak self] data, _, complete, error in
            guard let self else { return }
            var buffer = buffer
            if let data { buffer.append(data) }
            guard buffer.count <= 8192, error == nil else { self.remove(id); return }
            if let header = String(data: buffer, encoding: .utf8), header.contains("\r\n\r\n") {
                guard let request = CompanionRequest.parse(header) else {
                    self.send(connection, id: id, text: "HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n", close: true)
                    return
                }
                let cors = "Access-Control-Allow-Origin: \(request.origin)\r\nVary: Origin\r\nCache-Control: no-store\r\n"
                if request.path == "/status" {
                    let body = self.status()
                    self.send(connection, id: id, text: "HTTP/1.1 200 OK\r\n\(cors)Content-Type: application/json\r\nContent-Length: \(body.utf8.count)\r\nConnection: close\r\n\r\n\(body)", close: true)
                } else {
                    self.clients[id] = connection
                    self.send(connection, id: id, text: "HTTP/1.1 200 OK\r\n\(cors)Content-Type: text/event-stream\r\nConnection: keep-alive\r\n\r\nretry: 3000\n\ndata: \(self.foreground())\n\n")
                    self.watchDisconnect(connection, id: id)
                }
            } else if complete { self.remove(id) }
            else { self.readHeader(connection, id: id, buffer: buffer) }
        }
    }
    private func watchDisconnect(_ connection: NWConnection, id: UUID) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 1) { [weak self] _, _, _, _ in self?.remove(id) }
    }
    private func send(_ connection: NWConnection, id: UUID, text: String, close: Bool = false) {
        connection.send(content: Data(text.utf8), completion: .contentProcessed { [weak self] error in
            if error != nil || close { self?.remove(id) }
        })
    }
    func tick() {
        // Permission checks are safe while idle; window metadata is read only for active sessions.
        guard !clients.isEmpty else { return }
        let message = "data: \(self.foreground())\n\n"
        for (id, client) in clients { send(client, id: id, text: message) }
    }
}
