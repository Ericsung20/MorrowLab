# MorrowLab Companion

The companion identifies the foreground Mac app during a study session. The website classifies the
app, window title, and available browser URL as study, distraction, or unknown. A Chrome extension
alone cannot identify Safari or native games. Classification uses local rules, so unknown apps
remain unknown rather than being assumed to be games.

## Mac setup — no Terminal

1. Open the study-session page and select **Download for Mac** in **Mac companion setup**.
2. Unzip the download, drag **MorrowLab Companion.app** to Applications, and open it.
3. Use **Allow Accessibility** and **Allow Screen Recording** in the setup window. Enable
   **MorrowLab Companion** in each macOS settings pane. macOS requires the user's approval;
   the website and companion cannot grant these permissions themselves.
4. If macOS requests a quit/reopen, quit from the **MorrowLab mascot** menu-bar menu and reopen the app.
5. Return to MorrowLab. The page checks permissions automatically and sessions reconnect without
   needing to restart. **Open companion** opens setup again after the app has been launched once.

Requires macOS 13 or later. The package contains Apple silicon and Intel executables and requires
neither Node nor npm. Closing the setup window leaves the menu-bar app running. Quit it from **MorrowLab mascot →
Quit Companion**. It does not install a login item or start itself at login.

Only one companion can use port 47615. Stop an existing `npm run companion` process before opening
the native app. A port conflict is reported in the native setup window. The new native app has its
own macOS permissions, separate from permissions previously granted to Terminal or an IDE.

## Build the Mac package (maintainers)

On a Mac with Xcode or the Swift command-line tools:

```bash
bash companion/macos/build.sh
```

Outputs:

- `build/companion-macos/MorrowLab Companion.app`
- `public/downloads/MorrowLab-Companion-mac-universal.zip`
- `public/downloads/companion.json` (download availability and notarization state)

Generated binaries are ignored by Git. Build the companion **before** `npm run build` so Vite copies
the download into `dist/downloads/`. Development Vite serves it directly from `public/downloads/`.
Without a generated manifest, the page explains that the download is unavailable instead of linking
to a missing file. Build output is ad-hoc signed by default and intended for trusted local testing.
Downloaded ad-hoc builds may be blocked by Gatekeeper. Do not distribute them as a public release.

For public distribution, use a Developer ID Application certificate and a previously configured
notarytool Keychain profile (never commit credentials):

```bash
COMPANION_SIGNING_IDENTITY='Developer ID Application: Your Team (TEAMID)' \
COMPANION_NOTARY_PROFILE='your-keychain-profile' \
bash companion/macos/build.sh
npm run build
```

The build signs with the hardened runtime, submits for notarization, staples and validates the
result, checks Gatekeeper assessment, then recreates the zip. `notarized: true` is written only after
those steps succeed. Rebuilding ad-hoc binaries may require re-granting macOS permissions because
the code identity changes. This repository does not include a signing identity or notarization credentials.

## Connection and privacy

The native Swift/AppKit app listens **only on 127.0.0.1:47615**, never on the LAN. It exposes:

- `GET /status`: app/version and the two permission flags; no window metadata.
- `GET /events`: EventSource stream with `{ title, app, url? }` or `null`, compatible with the
  existing activity provider. The frontend retries while a session is active and stops on cleanup.

Both endpoints validate Host and Origin. Allowed origins are local HTTP pages on `localhost` and
`127.0.0.1` only, matching the current local deployment. These are local-development boundaries,
not authentication between different apps on the same computer. A hosted HTTPS deployment is **not
supported yet**; it needs an explicit production origin and browser local-network access testing.

The native app reads metadata once per second **only while an event-stream client is connected**.
It keeps no history and captures no screenshots, camera frames, audio, or keystrokes. The study page
stores activity segments in its existing local database. URL retrieval uses the focused window's
Accessibility document attribute where available, with a window-title fallback for unsupported
browsers. Permission readiness does not guarantee every browser exposes its URL.

Chrome extension metadata can enrich a matching foreground page; it cannot replace an unrelated
foreground app. Permission checks don't prompt automatically: native permission buttons are user-initiated.

## Developer/Windows fallback

```bash
npm install
npm run companion
```

This retains the original Node/get-windows server, with a `/status` response identifying it as a
legacy companion (no claim about permission readiness). On macOS, its permissions belong to the
terminal/IDE running it. Prefer the native app for Mac users. Windows still uses this fallback.

## Validation

```bash
npm test
npm run build
npm run lint
xcrun swiftc -swift-version 5 -module-cache-path build/companion-macos/module-cache \
  companion/macos/Protocol.swift companion/macos/ProtocolTests.swift \
  -o build/companion-macos/protocol-tests
build/companion-macos/protocol-tests
xcrun swiftc -swift-version 5 -module-cache-path build/companion-macos/module-cache \
  companion/macos/Protocol.swift companion/macos/Server.swift companion/macos/ServerTests.swift \
  -o build/companion-macos/server-tests
node companion/macos/test-server.mjs
```

Manual release checks: clean installation on both Mac architectures, permission denial/grant,
quit/reopen, Safari entertainment vs. lecture tabs, a native game, app disconnect/reconnect during a
session, duplicate companion, and a notarized download's Gatekeeper behavior.
