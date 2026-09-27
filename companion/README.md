# MorrowLab desktop companion

A web page can only see itself. This small program tells the MorrowLab page which window is in front
(**any app**, not just browser tabs), so time spent in e.g. KakaoTalk, games or Netflix counts as
distraction, and time in Word, Notion, PDF readers or task-related documents counts as study.

## Run

```bash
npm install          # once
npm run companion    # keep this terminal open while you study
```

Then start a session at the MorrowLab page. The "install/run" hint on the session page disappears
once the page is connected.

- **Windows:** works as is.
- **macOS:** the first run asks for **Screen Recording** permission (System Settings → Privacy &
  Security → Screen Recording → allow your terminal app). Without it, window titles are empty.
  On macOS the browser URL is also reported, which makes browser classification more precise.

## Privacy

- Only the current window's title and app name are read, once per second.
- They are sent only to MorrowLab pages on `localhost` / `127.0.0.1` (other websites get HTTP 403),
  and stored only in the browser's local MorrowLab database.

## With the browser extension

Both can run together. For browser tabs the extension is used (it knows the exact URL); for everything
else, the companion. With only the companion, browser tabs are judged from the window title
(e.g. `"Lecture 3 - YouTube - Google Chrome"`).

Classification rules: `classifyWindow` in `src/features/activity/classifyActivity.ts`.
