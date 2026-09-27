import { useEffect, useState } from 'react';
import { CheckCircle2, Download, ExternalLink, Laptop, RefreshCw } from 'lucide-react';

interface CompanionStatus {
  kind: 'native' | 'legacy';
  accessibility?: boolean;
  screenRecording?: boolean;
}
interface MacDownload { version: string; notarized: boolean }
const STATUS_URL = 'http://127.0.0.1:47615/status';

export function CompanionSetup() {
  const [status, setStatus] = useState<CompanionStatus | null>(null);
  const [checked, setChecked] = useState(false);
  const [check, setCheck] = useState(0);
  const [download, setDownload] = useState<MacDownload | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/downloads/companion.json', { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        if (!response.ok) return;
        const data = await response.json();
        if (typeof data.version === 'string' && typeof data.notarized === 'boolean') setDownload(data);
      }).catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => {
    let disposed = false;
    let retry: ReturnType<typeof setTimeout>;
    let controller: AbortController;
    const poll = async () => {
      controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1800);
      let next: CompanionStatus | null = null;
      try {
        const response = await fetch(STATUS_URL, { signal: controller.signal, cache: 'no-store' });
        if (response.ok) {
          const data = await response.json();
          if (data.app === 'MorrowLab Companion' && data.kind === 'native' &&
            typeof data.accessibility === 'boolean' && typeof data.screenRecording === 'boolean') next = data;
          else if (data.app === 'MorrowLab Companion' && data.kind === 'legacy') next = { kind: 'legacy' };
        }
      } catch { /* The app may not be installed or running yet. */ }
      finally { clearTimeout(timeout); }
      if (disposed) return;
      setStatus(next); setChecked(true);
      retry = setTimeout(() => void poll(), 3000);
    };
    void poll();
    return () => { disposed = true; clearTimeout(retry); controller?.abort(); };
  }, [check]);

  const native = status?.kind === 'native';
  const ready = native && status.accessibility && status.screenRecording;
  const headline = !checked ? 'Checking connection…' : ready ? 'Mac companion is ready' : native ? 'Connected · permissions needed'
    : status ? 'Terminal companion connected' : 'Connect your Mac apps';
  return <section className="companion-setup" aria-label="Mac companion setup">
    <div className="companion-heading">
      {ready ? <CheckCircle2 size={20} /> : <Laptop size={20} />}
      <div><h3>{headline}</h3><p>Recognize Safari, games, and other apps while you study.</p></div>
    </div>
    {ready ? <p className="companion-ready" role="status">Both permissions are allowed. Keep the MorrowLab menu-bar app open; study sessions connect automatically.</p> : <>
      <ol className="companion-steps">
        <li><strong>Open MorrowLab Companion</strong><span>Download the Mac app, unzip it, move it to Applications, and double-click it. No Terminal needed.</span></li>
        <li><strong>Allow two Mac permissions</strong><span>In the companion, use “Allow Accessibility” and “Allow Screen Recording.” Enable <b>MorrowLab Companion</b> in the settings that open.</span></li>
        <li><strong>Return here</strong><span>If macOS asks you to quit, reopen the companion afterward. This page checks the connection automatically.</span></li>
      </ol>
      {native && <div className="companion-permissions" role="status">
        <span>{status.accessibility ? '✓' : '○'} Accessibility: {status.accessibility ? 'allowed' : 'needed'}</span>
        <span>{status.screenRecording ? '✓' : '○'} Screen Recording: {status.screenRecording ? 'allowed' : 'needed'}</span>
      </div>}
      {status?.kind === 'legacy' && <p className="companion-note">Your terminal companion is connected. Quit it before opening the Mac app; only one companion can run at a time.</p>}
    </>}
    <div className="companion-actions">
      {!ready && download && <a className="companion-download" href="/downloads/MorrowLab-Companion-mac-universal.zip" download><Download size={14} /> Download for Mac</a>}
      <a href="morrowlab-companion://setup"><ExternalLink size={14} /> Open companion</a>
      <button type="button" className="secondary" aria-label="Check companion connection again" onClick={() => setCheck(n => n + 1)}><RefreshCw size={14} /> Check again</button>
    </div>
    {!ready && !download && <p className="companion-note">The Mac download is not available on this deployment yet.</p>}
    {!ready && download && !download.notarized && <p className="companion-note">Local test build · macOS may block this app because it is not Apple-notarized. Only open a build you trust. Public release signing is still pending.</p>}
    <p className="companion-privacy">Mac app: macOS 13 or later, Apple silicon and Intel. App names, window titles, and available browser URLs stay on this Mac. No screenshots or keystrokes. The Chrome extension only covers Chrome tabs.</p>
  </section>;
}
