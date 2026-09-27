import type { ActivitySegment, CameraEvent, StudySession } from '../../contracts/morrowlab'

export function clamp(value: number, min: number, max: number): number {
  return Number.isNaN(value) ? min : Math.min(max, Math.max(min, value))
}

export function calculateDistractionRatio(cameraEvents: CameraEvent[], durationSec: number): number {
  const interrupted = cameraEvents.reduce((sum, event) =>
    sum + (event.type !== 'studying' ? Math.max(0, event.durationSec || 0) : 0), 0)
  return clamp(interrupted / Math.max(durationSec || 0, 1), 0, 1)
}

/** Study share of classified browser time. Neutral/unknown/demo time is not evidence either way. Null means unmeasured. */
export function calculateScreenScore(segments: ActivitySegment[], durationSec: number): number | null {
  const known = segments.filter(s => s.source === 'browser' && Number.isFinite(s.durationSec) && s.durationSec > 0 &&
    (s.category === 'study' || s.category === 'distraction'))
  if (!known.length || !Number.isFinite(durationSec) || durationSec <= 0) return null
  const total = known.reduce((sum, s) => sum + s.durationSec, 0)
  const distracted = known.filter(s => s.category === 'distraction').reduce((sum, s) => sum + s.durationSec, 0)
  return 100 * (1 - clamp(distracted / total, 0, 1))
}

/** With screen evidence: 30/30/20/10/10. Otherwise retain the legacy 35/35/20/10 formula. */
export function calculateSessionScore(session: Pick<StudySession, 'reflection' | 'cameraEvents' | 'durationSec'> & Partial<Pick<StudySession, 'activitySegments'>>): number {
  if (!session.reflection) throw new Error('A reflection is required to calculate a Session Score.')
  const { focus, understanding, completionPct } = session.reflection
  const focusScore = ((clamp(focus, 1, 5) - 1) / 4) * 100
  const understandingScore = ((clamp(understanding, 1, 5) - 1) / 4) * 100
  const behaviorScore = 100 * (1 - calculateDistractionRatio(session.cameraEvents, session.durationSec))
  const screenScore = calculateScreenScore(session.activitySegments ?? [], session.durationSec)
  const reflectionWeight = screenScore === null ? 0.35 : 0.30
  return clamp(Math.round(reflectionWeight * focusScore + reflectionWeight * understandingScore +
    0.20 * clamp(completionPct, 0, 100) + 0.10 * behaviorScore + 0.10 * (screenScore ?? 0)), 0, 100)
}
