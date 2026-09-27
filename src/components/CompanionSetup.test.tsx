import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CompanionSetup } from './CompanionSetup';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const native = (accessibility: boolean, screenRecording: boolean) => ({ app: 'MorrowLab Companion', kind: 'native', accessibility, screenRecording });
function mockCompanion(initial: unknown = null) {
  let status = initial;
  const fetch = vi.fn(async (url: string) => {
    if (url === '/downloads/companion.json') return { ok: true, json: async () => ({ version: '0.1.0', notarized: false }) };
    if (status === null) throw new Error('offline');
    return { ok: true, json: async () => status };
  });
  vi.stubGlobal('fetch', fetch);
  return { fetch, report: (value: unknown) => { status = value; } };
}
it('guides installation, detects permissions, and notices disconnects without reloading', async () => {
  vi.useFakeTimers();
  const companion = mockCompanion();
  await act(async () => { render(<CompanionSetup />); });
  expect(screen.getByText('Connect your Mac apps')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Download for Mac' })).toHaveAttribute('href', '/downloads/MorrowLab-Companion-mac-universal.zip');
  expect(screen.getByText(/Local test build/)).toBeInTheDocument();
  companion.report(native(true, false));
  await act(async () => { vi.advanceTimersByTime(3000); });
  expect(screen.getByText('Screen Recording: needed', { exact: false })).toBeInTheDocument();
  companion.report(native(true, true));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Check companion connection again' })); });
  expect(screen.getByText('Mac companion is ready')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Download for Mac' })).not.toBeInTheDocument();
  companion.report(null);
  await act(async () => { vi.advanceTimersByTime(3000); });
  expect(screen.getByText('Connect your Mac apps')).toBeInTheDocument();
  cleanup();
  expect(vi.getTimerCount()).toBe(0);
});
it('does not claim permission readiness for the legacy companion or malformed data', async () => {
  vi.useFakeTimers();
  const companion = mockCompanion({ app: 'MorrowLab Companion', kind: 'legacy' });
  await act(async () => { render(<CompanionSetup />); });
  expect(screen.getByText('Terminal companion connected')).toBeInTheDocument();
  expect(screen.getByText(/Quit it before opening the Mac app/)).toBeInTheDocument();
  companion.report({ kind: 'native', accessibility: true, screenRecording: true });
  await act(async () => { vi.advanceTimersByTime(3000); });
  expect(screen.getByText('Connect your Mac apps')).toBeInTheDocument();
});
