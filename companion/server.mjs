// MorrowLab desktop companion: reports the foreground window (title + app) to the MorrowLab page,
// so time in any app — not only browser tabs — can be classified. Run with `npm run companion`.
// Nothing is stored or sent off this computer; only localhost MorrowLab pages may connect.
import http from 'node:http';
import path from 'node:path';
import { activeWindow } from 'get-windows';

const PORT = 47615;
const POLL_MS = 1000;
// Any website can ask 127.0.0.1 for data, so only local MorrowLab pages get window titles.
const ALLOWED_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

const clients = new Set();
let last = 'null';

async function poll() {
  let win = null;
  try {
    const w = await activeWindow();
    if (w) win = { title: w.title, app: `${w.owner.name} ${path.basename(w.owner.path ?? '')}`.trim(), url: w.url };
  } catch (error) {
    console.error('Could not read the active window:', error.message);
  }
  const json = JSON.stringify(win);
  if (json === last) return;
  last = json;
  for (const res of clients) res.write(`data: ${json}\n\n`);
}

http.createServer((req, res) => {
  const origin = req.headers.origin ?? '';
  if (req.url !== '/events' || !ALLOWED_ORIGIN.test(origin)) return res.writeHead(403).end();
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': origin });
  res.write(`data: ${last}\n\n`);
  clients.add(res);
  req.on('close', () => clients.delete(res));
}).listen(PORT, '127.0.0.1', () => {
  console.log(`MorrowLab companion running. Keep this window open while you study (port ${PORT}).`);
  setInterval(poll, POLL_MS);
  void poll();
});
