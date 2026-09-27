import { expect, it } from 'vitest'
import type { ActivitySegment } from '../../contracts/morrowlab'
import { calculateScreenScore, calculateSessionScore } from './calculateSessionScore'

const segment = (category: ActivitySegment['category'], durationSec: number, source: ActivitySegment['source'] = 'browser'): ActivitySegment => ({
  id: crypto.randomUUID(), label: 'tab', category, durationSec, source, startISO: '2026-09-26T09:00:00Z', endISO: '2026-09-26T09:01:00Z',
})
it('scores the study share of classified screen time, ignoring neutral time', () => {
  expect(calculateScreenScore([segment('study', 40), segment('distraction', 60), segment('neutral', 500)], 100)).toBe(40)
  expect(calculateScreenScore([segment('distraction', 100)], 100)).toBe(0)
})
it('does not treat unclassified, neutral, or demo activity as measured screen usage', () => {
  expect(calculateScreenScore([], 100)).toBeNull()
  expect(calculateScreenScore([segment(undefined, 100)], 100)).toBeNull()
  expect(calculateScreenScore([segment('neutral', 100)], 100)).toBeNull()
  expect(calculateScreenScore([segment('study', 100, 'demo')], 100)).toBeNull()
  expect(calculateScreenScore([segment('study', 0)], 0)).toBeNull()
})
it('uses new weights when measured and legacy weights otherwise', () => {
  const session = { durationSec: 100, cameraEvents: [], reflection: { focus: 4, understanding: 4, completionPct: 80 } }
  expect(calculateSessionScore(session)).toBe(79)
  expect(calculateSessionScore({ ...session, activitySegments: [segment('study', 100)] })).toBe(81)
  expect(calculateSessionScore({ ...session, activitySegments: [segment('distraction', 100)] })).toBe(71)
})
