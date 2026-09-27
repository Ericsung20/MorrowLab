# MorrowLab Tab Tracker (Chrome / Edge / Whale)

A web page can't see other tabs, so this small extension tells the MorrowLab page which tab is
active. MorrowLab then classifies it as study (e.g. Google Docs, lecture videos), distraction
(e.g. Netflix, webtoons, games, entertainment YouTube) or unknown. Tab titles and hosts are stored
only in your browser's local MorrowLab database; full URLs are never stored.

## Install

1. Open `chrome://extensions` (Edge: `edge://extensions`).
2. Turn on **Developer mode**.
3. Click **Load unpacked** and choose this `extension/` folder.
4. Reload the MorrowLab tab. The session page stops showing the "install the extension" hint.

It only runs on `localhost` / `127.0.0.1`. If MorrowLab is deployed elsewhere, add that origin to
`matches` in `manifest.json`.

Classification rules live in `src/features/activity/classifyActivity.ts`.
