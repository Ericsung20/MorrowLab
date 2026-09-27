#!/bin/bash
set -euo pipefail
PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUTPUT="$PROJECT_ROOT/build/companion-macos"
STAGING="$(mktemp -d /private/tmp/morrowlab-companion.XXXXXX)"
trap 'rm -rf "$STAGING"' EXIT
APP="$STAGING/MorrowLab Companion.app"
DOWNLOADS="$PROJECT_ROOT/public/downloads"
mkdir -p "$APP/Contents/MacOS" "$OUTPUT/module-cache" "$DOWNLOADS"
# Hide any prior download until the new signed package is complete.
rm -f "$DOWNLOADS/companion.json"
cp "$PROJECT_ROOT/companion/macos/Info.plist" "$APP/Contents/Info.plist"
for ARCH in arm64 x86_64; do
  xcrun swiftc -swift-version 5 -O -target "$ARCH-apple-macos13.0" \
    -module-cache-path "$OUTPUT/module-cache" \
    "$PROJECT_ROOT/companion/macos/Protocol.swift" "$PROJECT_ROOT/companion/macos/Server.swift" "$PROJECT_ROOT/companion/macos/main.swift" \
    -o "$OUTPUT/MorrowLabCompanion-$ARCH"
done
xcrun lipo -create "$OUTPUT/MorrowLabCompanion-arm64" "$OUTPUT/MorrowLabCompanion-x86_64" -output "$APP/Contents/MacOS/MorrowLabCompanion"
# Generated bundles can inherit Finder metadata from the build directory.
xattr -cr "$APP"
SIGNING_IDENTITY="${COMPANION_SIGNING_IDENTITY:--}"
if [ "$SIGNING_IDENTITY" = "-" ]; then
  codesign --force --sign - --timestamp=none "$APP"
else
  codesign --force --sign "$SIGNING_IDENTITY" --options runtime --timestamp "$APP"
fi
codesign --verify --deep --strict "$APP"
ARCHIVE="$DOWNLOADS/MorrowLab-Companion-mac-universal.zip"
# ditto replaces the archive; never append stale binaries from earlier builds.
rm -f "$ARCHIVE"
ditto -c -k --sequesterRsrc --keepParent "$APP" "$ARCHIVE"
NOTARIZED=false
if [ -n "${COMPANION_NOTARY_PROFILE:-}" ]; then
  if [ "$SIGNING_IDENTITY" = "-" ]; then
    echo 'Notarization requires COMPANION_SIGNING_IDENTITY (Developer ID Application).' >&2
    exit 1
  fi
  xcrun notarytool submit "$ARCHIVE" --keychain-profile "$COMPANION_NOTARY_PROFILE" --wait
  xcrun stapler staple "$APP"
  xcrun stapler validate "$APP"
  spctl --assess --type execute "$APP"
  rm -f "$ARCHIVE"
  ditto -c -k --sequesterRsrc --keepParent "$APP" "$ARCHIVE"
  NOTARIZED=true
fi
cat > "$DOWNLOADS/companion.json" <<JSON
{"version":"0.1.0","platform":"macOS 13+","architecture":"universal","notarized":$NOTARIZED}
JSON
ditto "$APP" "$OUTPUT/MorrowLab Companion.app"
printf 'Built: %s\nDownload: %s\nNotarized: %s\n' "$OUTPUT/MorrowLab Companion.app" "$ARCHIVE" "$NOTARIZED"
