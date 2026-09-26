import { expect, it } from 'vitest'
import type { ActivitySegment } from '../../contracts/morrowlab'
import { ACTIVITY_LABELS } from '../../contracts/activity'
import { calculateScreenScore, calculateSessionScore } from './calculateSessionScore'

const segment = (label: string, durationSec: number, source: ActivitySegment['source'] = 'browser'): ActivitySegment => ({
  id: crypto.randomUUID(), label, durationSec, source, startISO: '2026-09-26T09:00:00Z', endISO: '2026-09-26T09:01:00Z',
})
it('scores the measured share of off-task screen time', () => {
  expect(calculateScreenScore([segment(ACTIVITY_LABELS.active, 40), segment(ACTIVITY_LABELS.other, 60)], 100)).toBe(40)
  expect(calculateScreenScore([segment(ACTIVITY_LABELS.other, 100)], 100)).toBe(0)
})
it.each([ACTIVITY_LABELS.research, ACTIVITY_LABELS.lecture])('credits declared study activity: %s', label => {
  expect(calculateScreenScore([segment(label, 100)], 100)).toBe(100)
})
it('does not treat unknown labels or demo app names as measured screen usage', () => {
  expect(calculateScreenScore([], 100)).toBeNull()
  expect(calculateScreenScore([segment('YouTube', 100)], 100)).toBeNull()
  expect(calculateScreenScore([segment(ACTIVITY_LABELS.active, 100, 'demo')], 100)).toBeNull()
  expect(calculateScreenScore([segment(ACTIVITY_LABELS.active, 0)], 0)).toBeNull()
})
it('uses new weights when measured and legacy weights otherwise', () => {
  const session = { durationSec: 100, cameraEvents: [], reflection: { focus: 4, understanding: 4, completionPct: 80 } }
  expect(calculateSessionScore(session)).toBe(79)
  expect(calculateSessionScore({ ...session, activitySegments: [segment(ACTIVITY_LABELS.active, 100)] })).toBe(81)
  expect(calculateSessionScore({ ...session, activitySegments: [segment(ACTIVITY_LABELS.other, 100)] })).toBe(71)
})
