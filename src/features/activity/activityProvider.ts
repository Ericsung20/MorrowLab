import type { ActivitySegment, StudyTask } from '../../contracts/morrowlab';
import { ACTIVITY_LABELS } from '../../contracts/activity';
import { classifyActivity, classifyWindow, hostOf } from './classifyActivity';

export interface ActivityProvider {
  start(): void;
  stop(): ActivitySegment[];
  getSegments(): ActivitySegment[];
  readonly extensionConnected?: boolean;
  readonly companionConnected?: boolean;
}

type SegmentMeta = Pick<ActivitySegment, 'category' | 'host' | 'taskId' | 'studyOverride'>;

/** Shared interval logic; snapshots include the current interval without closing it. */
export class ActivityTimeline {
  private segments: ActivitySegment[] = [];
  private active: { label: string; meta: SegmentMeta; start: number; id: string } | null = null;
  private readonly source: ActivitySegment['source'];
  private readonly now: () => number;
  constructor(source: ActivitySegment['source'], now = Date.now) { this.source = source; this.now = now; }
  reset() { this.segments = []; this.active = null; }
  transition(label: string, meta: SegmentMeta = {}) {
    const a = this.active;
    if (a && a.label === label && a.meta.studyOverride === meta.studyOverride && a.meta.category === meta.category && a.meta.host === meta.host && a.meta.taskId === meta.taskId) return;
    const now = this.now();
    this.close(now);
    this.active = { label, meta, start: now, id: crypto.randomUUID() };
  }
  private current(now: number): ActivitySegment | null {
    const a = this.active;
    return a && now > a.start ? { id: a.id, label: a.label, ...a.meta, startISO: new Date(a.start).toISOString(), endISO: new Date(now).toISOString(), durationSec: (now - a.start) / 1000, source: this.source } : null;
  }
  private close(now: number) { const segment = this.current(now); if (segment) this.segments.push(segment); this.active = null; }
  getSegments() { const current = this.current(this.now()); return [...this.segments, ...(current ? [current] : [])].map(s => ({ ...s })); }
  stop() { this.close(this.now()); return this.getSegments(); }
}

/** Messages exchanged with the MorrowLab browser extension (see /extension). */
export const EXTENSION_TAB_MESSAGE = 'morrowlab:active-tab';
export const EXTENSION_REQUEST_MESSAGE = 'morrowlab:request-tab';
export const isExtensionInstalled = () => document.documentElement.dataset.morrowlabExtension === '1';
/** Desktop companion (companion/server.mjs): reports the foreground window of any app. */
export const COMPANION_URL = 'http://127.0.0.1:47615/events';
interface ExternalTab { title: string; url?: string }
interface ForegroundWindow { title: string; app: string; url?: string }

/**
 * Tracks which screen the student is on. Without the extension, other tabs are only known as "other";
 * with it, each tab's title/host is recorded and classified as study, distraction, or neutral.
 */
export class BrowserActivityProvider implements ActivityProvider {
  private timeline = new ActivityTimeline('browser');
  private running = false;
  private focused = false;
  /** undefined: no extension report yet; null: focus is outside the browser. */
  private tab: ExternalTab | null | undefined = undefined;
  /** undefined: companion not connected; null: no foreground window. */
  private window: ForegroundWindow | null | undefined = undefined;
  private companion: EventSource | null = null;
  private companionRetry: ReturnType<typeof setTimeout> | null = null;
  private readonly tasks: StudyTask[];
  constructor(tasks: StudyTask[] = []) { this.tasks = tasks; }
  get extensionConnected() { return this.tab !== undefined; }
  get companionConnected() { return !!this.window; }
  private update = () => {
    if (!this.running) return;
    const win = this.window;
    // The foreground window is authoritative. Only enrich it with extension data
    // when both reports describe the same page; Chrome may still hold an old tab.
    const reportedTab = this.tab;
    const samePage = !!win && !!reportedTab && (
      win.url ? win.url === reportedTab.url :
      !!reportedTab.title && (win.title === reportedTab.title || win.title.startsWith(`${reportedTab.title} - `))
    );
    const tab = win && !samePage ? undefined : reportedTab;
    const localPage = (url?: string) => {
      try { return !!url && new URL(url).origin === location.origin; } catch { return false; }
    };
    const ownTab = win
      ? localPage(win.url) || (!win.url && (win.title === document.title || win.title.startsWith(`${document.title} - `)))
      : localPage(tab?.url);
    if ((!win && document.visibilityState === 'visible' && this.focused) || ownTab)
      return this.timeline.transition(ACTIVITY_LABELS.active, { category: 'study' });
    if (tab) {
      const host = hostOf(tab.url) || undefined;
      return this.timeline.transition(tab.title.slice(0, 200) || host || 'Untitled tab', { host, ...classifyActivity(tab, this.tasks) });
    }
    if (win) {
      const label = `${win.title || win.app}`.slice(0, 200);
      return this.timeline.transition(label, { host: hostOf(win.url) || undefined, ...classifyWindow(win, this.tasks) });
    }
    if (tab === null) return this.timeline.transition(ACTIVITY_LABELS.outside, { category: 'neutral' });
    this.timeline.transition(ACTIVITY_LABELS.other, { category: 'neutral' });
  };
  private connectCompanion() {
    if (typeof EventSource === 'undefined') return;
    const source = new EventSource(COMPANION_URL);
    this.companion = source;

    source.onmessage = (e) => {
      try {
        const w = JSON.parse(e.data);
        this.window = w && typeof w.title === 'string' && typeof w.app === 'string'
          ? { title: w.title, app: w.app, url: typeof w.url === 'string' ? w.url : undefined } : null;
      } catch { return; }
      this.update();
    };
    // Opening the companion during a session must work without restarting the session.
    source.onerror = () => {
      source.close();
      this.companion = null;
      this.window = undefined;
      this.update();
      if (this.running && this.companionRetry === null) this.companionRetry = setTimeout(() => {
        this.companionRetry = null;
        if (this.running) this.connectCompanion();
      }, 3000);
    };
  }
  private onMessage = (e: MessageEvent) => {
    if (e.source !== window || e.data?.type !== EXTENSION_TAB_MESSAGE) return;
    const tab = e.data.tab;
    this.tab = tab && typeof tab.title === 'string' ? { title: tab.title, url: typeof tab.url === 'string' ? tab.url : undefined } : null;
    this.update();
  };
  private focus = () => { this.focused = true; this.update(); };
  private blur = () => { this.focused = false; this.update(); };
  start() {
    if (this.running) return;
    this.running = true;
    this.timeline.reset();
    this.tab = undefined;
    this.window = undefined;
    this.focused = document.hasFocus();
    document.addEventListener('visibilitychange', this.update);
    window.addEventListener('focus', this.focus);
    window.addEventListener('blur', this.blur);
    window.addEventListener('message', this.onMessage);
    this.update();
    window.postMessage({ type: EXTENSION_REQUEST_MESSAGE }, location.origin);
    this.connectCompanion();
  }
  getSegments() { return this.timeline.getSegments(); }
  stop() {
    this.running = false;
    document.removeEventListener('visibilitychange', this.update);
    window.removeEventListener('focus', this.focus);
    window.removeEventListener('blur', this.blur);
    window.removeEventListener('message', this.onMessage);
    if (this.companionRetry !== null) clearTimeout(this.companionRetry);
    this.companionRetry = null;
    this.companion?.close();
    this.companion = null;
    return this.timeline.stop();
  }
}

/** Synthetic app labels, never a claim to observe native OS applications. */
export class DemoActivityProvider implements ActivityProvider {
  private timeline = new ActivityTimeline('demo');
  private timer: ReturnType<typeof setInterval> | null = null;
  start() {
    if (this.timer !== null) return;
    this.timeline.reset();
    const labels = ['VS Code', 'Chrome', 'PDF Reader'];
    let index = 0;
    this.timeline.transition(labels[index]);
    this.timer = setInterval(() => this.timeline.transition(labels[++index % labels.length]), 15000);
  }
  getSegments() { return this.timeline.getSegments(); }
  stop() { if (this.timer !== null) clearInterval(this.timer); this.timer = null; return this.timeline.stop(); }
}
