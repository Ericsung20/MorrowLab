import Foundation

// Both Host and Origin are checked: a remote site must not read local window metadata.
struct CompanionRequest {
    let path: String
    let origin: String
    static func parse(_ header: String) -> CompanionRequest? {
        let lines = header.components(separatedBy: "\r\n")
        guard let first = lines.first else { return nil }
        let request = first.split(separator: " ")
        guard request.count == 3, request[0] == "GET", request[2] == "HTTP/1.1",
              ["/events", "/status"].contains(String(request[1])) else { return nil }
        var headers: [String: String] = [:]
        for line in lines.dropFirst() where !line.isEmpty {
            guard let colon = line.firstIndex(of: ":") else { return nil }
            let key = line[..<colon].lowercased()
            guard headers[key] == nil else { return nil }
            headers[key] = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
        }
        guard let host = headers["host"], ["127.0.0.1:47615", "localhost:47615"].contains(host),
              let origin = headers["origin"],
              origin.range(of: #"^http://(localhost|127\.0\.0\.1)(:[0-9]{1,5})?$"#, options: .regularExpression) != nil,
              headers["transfer-encoding"] == nil, headers["content-length"] == nil || headers["content-length"] == "0"
        else { return nil }
        return CompanionRequest(path: String(request[1]), origin: origin)
    }
}
