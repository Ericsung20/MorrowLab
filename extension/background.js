// Reports the focused tab's title/URL to open MorrowLab pages. Nothing is sent anywhere else.
const ports = new Set();

async function activeTab() {
  const win = await chrome.windows.getLastFocused().catch(() => null);
  if (!win || !win.focused) return null; // another app (not the browser) has focus
  const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
  return tab ? { title: tab.title ?? '', url: tab.url ?? '' } : null;
}

async function broadcast() {
  if (!ports.size) return;
  const tab = await activeTab();
  for (const port of ports) port.postMessage({ tab });
}

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'morrowlab') return;
  ports.add(port);
  port.onDisconnect.addListener(() => ports.delete(port));
  port.onMessage.addListener(() => void broadcast());
  void broadcast();
});
chrome.tabs.onActivated.addListener(() => void broadcast());
chrome.tabs.onUpdated.addListener((_id, change, tab) => { if (tab.active && (change.title || change.url)) void broadcast(); });
chrome.windows.onFocusChanged.addListener(() => void broadcast());
