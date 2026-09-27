import { afterEach, expect, it, vi } from 'vitest';
import { ActivityTimeline, BrowserActivityProvider, COMPANION_URL, DemoActivityProvider, EXTENSION_TAB_MESSAGE } from './activityProvider';
import { ACTIVITY_LABELS } from '../../contracts/activity';
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
it('closes transitions, ignores duplicate labels, and snapshots without duplication', () => {
  let now = 0;
  const timeline = new ActivityTimeline('browser', () => now);
  timeline.transition('MorrowLab active'); now = 2000;
  timeline.transition('MorrowLab active');
  expect(timeline.getSegments()[0].durationSec).toBe(2);
  timeline.transition(ACTIVITY_LABELS.other); now = 5000;
  expect(timeline.stop().map(s => s.durationSec)).toEqual([2, 3]);
  expect(timeline.stop()).toHaveLength(2);
});
it('tracks visibility/focus and removes listeners on stop', () => {
  vi.useFakeTimers(); vi.setSystemTime(1000);
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  const p = new BrowserActivityProvider(); p.start(); p.start();
  vi.advanceTimersByTime(1000); window.dispatchEvent(new Event('blur'));
  vi.advanceTimersByTime(1000); visibility.mockReturnValue('hidden'); window.dispatchEvent(new Event('focus'));
  vi.advanceTimersByTime(1000); visibility.mockReturnValue('visible'); document.dispatchEvent(new Event('visibilitychange'));
  vi.advanceTimersByTime(1000);
  const result = p.stop();
  expect(result.map(s => s.label)).toEqual([ACTIVITY_LABELS.active, ACTIVITY_LABELS.other, ACTIVITY_LABELS.active]);
  expect(result.map(s => s.durationSec)).toEqual([1, 2, 1]);
  window.dispatchEvent(new Event('blur')); vi.advanceTimersByTime(1000);
  expect(p.getSegments()).toEqual(result);
});
it('marks synthetic activity as demo and stops its timer', () => {
  vi.useFakeTimers();
  const p = new DemoActivityProvider(); p.start(); vi.advanceTimersByTime(16000);
  expect(p.stop().map(s => [s.label, s.source])).toEqual([['VS Code', 'demo'], ['Chrome', 'demo']]);
  expect(vi.getTimerCount()).toBe(0);
});

it('labels and classifies other tabs reported by the extension', () => {
  vi.useFakeTimers(); vi.setSystemTime(1000);
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  const tasks = [{ id: 'calc', title: 'Calculus problem set', subject: 'Math', estimatedMinutes: 30, deadlineISO: '', createdAtISO: '', status: 'todo' as const }];
  const p = new BrowserActivityProvider(tasks); p.start();
  const report = (tab: { title: string; url: string } | null) =>
    window.dispatchEvent(new MessageEvent('message', { data: { type: EXTENSION_TAB_MESSAGE, tab }, source: window }));
  expect(p.extensionConnected).toBe(false);
  vi.advanceTimersByTime(1000); visibility.mockReturnValue('hidden'); window.dispatchEvent(new Event('blur'));
  report({ title: 'Calculus: limits lecture - YouTube', url: 'https://www.youtube.com/watch?v=1' });
  vi.advanceTimersByTime(2000); report({ title: 'Netflix', url: 'https://www.netflix.com/browse' });
  vi.advanceTimersByTime(3000); report(null);
  vi.advanceTimersByTime(1000);
  // Spoofed messages from other frames are ignored.
  window.dispatchEvent(new MessageEvent('message', { data: { type: EXTENSION_TAB_MESSAGE, tab: { title: 'x', url: 'https://x.com' } } }));
  expect(p.extensionConnected).toBe(true);
  expect(p.stop().map(s => [s.label, s.category, s.host, s.taskId, s.durationSec])).toEqual([
    [ACTIVITY_LABELS.active, 'study', undefined, undefined, 1],
    ['Calculus: limits lecture - YouTube', 'study', 'youtube.com', 'calc', 2],
    ['Netflix', 'distraction', 'netflix.com', undefined, 3],
    [ACTIVITY_LABELS.outside, 'neutral', undefined, undefined, 1],
  ]);
});

it('uses the foreground companion window and only enriches matching tabs', () => {
  vi.useFakeTimers(); vi.setSystemTime(1000);
  vi.spyOn(document, 'hasFocus').mockReturnValue(false);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  const sources: FakeEventSource[] = [];
  class FakeEventSource {
    static CLOSED = 2;
    readyState = 1; closed = false;
    onopen: (() => void) | null = null; onmessage: ((e: { data: string }) => void) | null = null; onerror: (() => void) | null = null;
    url: string;
    constructor(url: string) { this.url = url; sources.push(this); }
    close() { this.closed = true; this.readyState = 2; }
  }
  vi.stubGlobal('EventSource', FakeEventSource);
  const p = new BrowserActivityProvider(); p.start();
  const source = sources[0];
  expect(source.url).toBe(COMPANION_URL);
  source.onopen?.();
  document.title = 'MorrowLab';
  source.onmessage?.({ data: JSON.stringify({ title: 'MorrowLab - Google Chrome', app: 'Google Chrome chrome.exe' }) });
  vi.advanceTimersByTime(500);
  source.onmessage?.({ data: JSON.stringify({ title: '친구', app: 'KakaoTalk KakaoTalk.exe' }) });
  expect(p.companionConnected).toBe(true);
  vi.advanceTimersByTime(2000);
  window.dispatchEvent(new MessageEvent('message', { data: { type: EXTENSION_TAB_MESSAGE, tab: { title: 'Notes', url: 'https://docs.google.com/d/1' } }, source: window }));
  vi.advanceTimersByTime(1000);
  // An old Chrome tab cannot replace the foreground app or Safari.
  source.onmessage?.({ data: JSON.stringify({ title: 'Funny cats - YouTube', app: 'Safari' }) });
  vi.advanceTimersByTime(1000);
  source.onmessage?.({ data: JSON.stringify({ title: 'Notes - Google Chrome', app: 'Google Chrome' }) });
  vi.advanceTimersByTime(1000);
  source.onmessage?.({ data: JSON.stringify({ title: 'Hades', app: 'Hades' }) });
  vi.advanceTimersByTime(1000);
  source.onmessage?.({ data: 'null' });
  expect(p.companionConnected).toBe(false);
  expect(p.stop().map(s => [s.label, s.category, s.durationSec])).toEqual([
    [ACTIVITY_LABELS.active, 'study', 0.5], ['친구', 'distraction', 3],
    ['Funny cats - YouTube', 'distraction', 1], ['Notes', 'study', 1], ['Hades', 'distraction', 1],
  ]);
  expect(source.closed).toBe(true);
  vi.unstubAllGlobals();
});

it('reconnects when the companion opens mid-session and cancels retries on stop', () => {
  vi.useFakeTimers();
  const sources: { close: () => void; closed?: boolean; onerror: (() => void) | null }[] = [];
  vi.stubGlobal('EventSource', class { static CLOSED = 2; onerror: (() => void) | null = null; closed = false; constructor() { sources.push(this); } close() { this.closed = true; } });
  const p = new BrowserActivityProvider(); p.start();
  sources[0].onerror?.();
  expect(sources[0].closed).toBe(true);
  expect(p.companionConnected).toBe(false);
  vi.advanceTimersByTime(3000);
  expect(sources).toHaveLength(2);
  sources[1].onerror?.();
  p.stop();
  vi.advanceTimersByTime(6000);
  expect(sources).toHaveLength(2);
  expect(vi.getTimerCount()).toBe(0);
  vi.unstubAllGlobals();
});
