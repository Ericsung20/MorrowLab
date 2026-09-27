// Run after compiling ServerTests.swift, against the real Swift HTTP server with fixture metadata.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import path from 'node:path';
import http from 'node:http';

const server = spawn(path.resolve('build/companion-macos/server-tests'), [], { stdio: ['ignore', 'pipe', 'inherit'] });
const base = 'http://127.0.0.1:47615';
const headers = { Origin: 'http://localhost:5173' };
const get = (route, extra = {}) => fetch(`${base}${route}`, { headers, signal: AbortSignal.timeout(2000), ...extra });
try {
  const ready = await Promise.race([
    once(server.stdout, 'data').then(([data]) => String(data)),
    once(server, 'error').then(([error]) => { throw error; }),
    new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Server did not start')), 5000); timer.unref(); }),
  ]);
  assert.match(ready, /Ready/);
  const status = await get('/status');
  assert.equal(status.headers.get('access-control-allow-origin'), headers.Origin);
  assert.equal((await status.json()).reads, 0, 'status polling must not collect window metadata');
  for (const origin of ['https://evil.example', 'http://localhost.evil.example', 'null']) {
    assert.equal((await get('/events', { headers: { Origin: origin } })).status, 403);
  }
  // fetch normalizes Host; use the HTTP client to send the actual hostile header.
  const hostileHost = await new Promise((resolve, reject) => {
    const request = http.get(`${base}/status`, { headers: { ...headers, Host: 'evil.example:47615' } }, response => {
      response.resume(); resolve(response.statusCode);
    });
    request.on('error', reject);
    request.setTimeout(2000, () => request.destroy(new Error('Host check timed out')));
  });
  assert.equal(hostileHost, 403);
  assert.equal((await get('/status', { headers: {} })).status, 403);
  assert.equal((await get('/status', { method: 'POST' })).status, 403);
  assert.equal((await get('/not-a-route')).status, 403);
  const controller = new AbortController();
  const stream = await get('/events', { signal: controller.signal });
  assert.equal(stream.headers.get('content-type'), 'text/event-stream');
  const reader = stream.body.getReader();
  const first = await reader.read();
  assert.match(new TextDecoder().decode(first.value), /Fixture window/);
  controller.abort();
  await new Promise(resolve => setTimeout(resolve, 250));
  const stopped = (await (await get('/status')).json()).reads;
  assert.ok(stopped > 0);
  await new Promise(resolve => setTimeout(resolve, 250));
  assert.equal((await (await get('/status')).json()).reads, stopped, 'window collection must stop after disconnect');
  console.log('Native HTTP integration passed: status, SSE, disconnect cleanup, origin/host/method rejection.');
} finally { server.kill('SIGTERM'); }
