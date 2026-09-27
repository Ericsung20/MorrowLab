import Foundation
@main struct ServerTests {
    static func main() {
        var reads = 0
        let server = CompanionServer(status: { "{\"reads\":\(reads)}" }, foreground: {
            reads += 1
            return "{\"title\":\"Fixture window\",\"app\":\"Fixture app\"}"
        })
        server.onState = { message in print(message); fflush(stdout) }
        server.start()
        let timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { _ in server.tick() }
        withExtendedLifetime(timer) { RunLoop.main.run() }
    }
}
