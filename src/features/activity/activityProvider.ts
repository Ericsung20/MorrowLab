import type { ActivitySegment } from '../../contracts/morrowlab';

export interface ActivityProvider {
  start(): void;
  stop(): ActivitySegment[];
  getSegments(): ActivitySegment[];
}

/** Shared interval logic; snapshots include the current interval without closing it. */
export class ActivityTimeline {
  private segments: ActivitySegment[] = [];
  private active: { label: string; start: number; id: string } | null = null;
  private readonly source: ActivitySegment['source'];
  private readonly now: () => number;
  constructor(source: ActivitySegment['source'], now = Date.now) { this.source = source; this.now = now; }
  reset() { this.segments = []; this.active = null; }
  transition(label: string) {
    if (label === this.active?.label) return;
    const now = this.now();
    this.close(now);
    this.active = { label, start: now, id: crypto.randomUUID() };
  }
  private current(now: number): ActivitySegment | null {
    const a = this.active;
    return a && now > a.start ? { id: a.id, label: a.label, startISO: new Date(a.start).toISOString(), endISO: new Date(now).toISOString(), durationSec: (now - a.start) / 1000, source: this.source } : null;
  }
  private close(now: number) { const segment = this.current(now); if (segment) this.segments.push(segment); this.active = null; }
  getSegments() { const current = this.current(this.now()); return [...this.segments, ...(current ? [current] : [])].map(s => ({ ...s })); }
  stop() { this.close(this.now()); return this.getSegments(); }
}

export class BrowserActivityProvider implements ActivityProvider {
  private timeline = new ActivityTimeline('browser');
  private running = false;
  private focused = false;
  private update = () => this.timeline.transition(document.visibilityState === 'visible' && this.focused ? 'MorrowLab active' : 'Other tab/window');
  private focus = () => { this.focused = true; this.update(); };
  private blur = () => { this.focused = false; this.update(); };
  start() {
    if (this.running) return;
    this.running = true;
    this.timeline.reset();
    this.focused = document.hasFocus();
    document.addEventListener('visibilitychange', this.update);
    window.addEventListener('focus', this.focus);
    window.addEventListener('blur', this.blur);
    this.update();
  }
  getSegments() { return this.timeline.getSegments(); }
  stop() {
    this.running = false;
    document.removeEventListener('visibilitychange', this.update);
    window.removeEventListener('focus', this.focus);
    window.removeEventListener('blur', this.blur);
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
