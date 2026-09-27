// Bridges the extension and the MorrowLab page (src/features/activity/activityProvider.ts).
document.documentElement.dataset.morrowlabExtension = '1';
let port = null;

function connect() {
  try {
    port = chrome.runtime.connect({ name: 'morrowlab' });
  } catch {
    return; // extension was reloaded or removed; the page falls back to "other tab" tracking
  }
  port.onMessage.addListener(msg => window.postMessage({ type: 'morrowlab:active-tab', tab: msg.tab }, location.origin));
  // The MV3 service worker is stopped when idle; reconnecting wakes it up again.
  port.onDisconnect.addListener(() => { port = null; setTimeout(connect, 1000); });
}
connect();

window.addEventListener('message', e => {
  if (e.source === window && e.data?.type === 'morrowlab:request-tab') port?.postMessage('request');
});
