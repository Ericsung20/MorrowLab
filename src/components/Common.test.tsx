import { render, screen, within, cleanup } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { BehaviorTimeline, SessionHighlights } from './Common';
import type { CameraEvent } from '../contracts/morrowlab';
afterEach(cleanup);
const event = (type: CameraEvent['type'], start: number, end: number): CameraEvent => ({
  id: `${start}`, type, startISO: new Date(start * 1000).toISOString(), endISO: new Date(end * 1000).toISOString(), durationSec: end - start, confidence: 1, source: 'model',
});
const events = [event('studying', 0, 30), event('phone', 30, 70), event('studying', 70, 100)];
it('shows one cumulative row per state, longest first', () => {
  const { container } = render(<BehaviorTimeline events={events} />);
  const rows = container.querySelectorAll('.event-list > div');
  expect(rows).toHaveLength(2);
  expect(rows[0]).toHaveTextContent('Studying01:00');
  expect(rows[1]).toHaveTextContent('Phone00:40');
});
it('highlights totals and separates untracked time from distraction', () => {
  render(<SessionHighlights events={events} segments={[]} elapsed={110} />);
  const highlights = within(screen.getByRole('region', { name: 'Study session highlights' }));
  expect(highlights.getByText('Total study time').nextElementSibling).toHaveTextContent('01:00');
  expect(highlights.getByText('Distracted time').nextElementSibling).toHaveTextContent('00:40');
  expect(highlights.getByText(/Longest study streak/)).toHaveTextContent('00:30');
  expect(highlights.getByText(/Untracked/)).toHaveTextContent('00:10');
});
