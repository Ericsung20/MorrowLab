import Foundation
@main struct ProtocolTests {
    static func main() {
        func request(_ path: String = "/status", _ origin: String = "http://localhost:5173", _ host: String = "127.0.0.1:47615", _ extra: String = "") -> String {
            "GET \(path) HTTP/1.1\r\nHost: \(host)\r\nOrigin: \(origin)\r\n\(extra)\r\n"
        }
        precondition(CompanionRequest.parse(request())?.path == "/status")
        precondition(CompanionRequest.parse(request("/events", "http://127.0.0.1:4173"))?.path == "/events")
        for origin in ["https://evil.example", "http://localhost.evil.example", "null", "http://localhost:5173/path", "http://user@localhost:5173", "http://127.0.0.1:5173\nX: x"] {
            precondition(CompanionRequest.parse(request("/events", origin)) == nil)
        }
        precondition(CompanionRequest.parse(request("/events", "http://localhost:5173", "evil.example:47615")) == nil)
        precondition(CompanionRequest.parse(request("/settings")) == nil)
        precondition(CompanionRequest.parse(request().replacingOccurrences(of: "GET", with: "POST")) == nil)
        precondition(CompanionRequest.parse(request("/events", "http://localhost", "localhost:47615", "Origin: http://localhost\r\n")) == nil)
        precondition(CompanionRequest.parse(request("/events", "http://localhost", "localhost:47615", "Transfer-Encoding: chunked\r\n")) == nil)
        print("Companion HTTP boundary tests passed")
    }
}
