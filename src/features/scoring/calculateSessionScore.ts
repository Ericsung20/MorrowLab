import type { CameraEvent, StudySession } from '../../contracts/morrowlab'

export function clamp(value: number, min: number, max: number): number {
  return Number.isNaN(value) ? min : Math.min(max, Math.max(min, value))
}

export function calculateDistractionRatio(cameraEvents: CameraEvent[], durationSec: number): number {
  const interrupted = cameraEvents.reduce((sum, event) =>
    sum + (event.type === 'phone' || event.type === 'away' ? Math.max(0, event.durationSec || 0) : 0), 0)
  return clamp(interrupted / Math.max(durationSec || 0, 1), 0, 1)
}

/** Session Score: self-report carries 90% of the weight; observable behavior 10%. */
export function calculateSessionScore(session: Pick<StudySession, 'reflection' | 'cameraEvents' | 'durationSec'>): number {
  if (!session.reflection) throw new Error('A reflection is required to calculate a Session Score.')
  const { focus, understanding, completionPct } = session.reflection
  const focusScore = ((clamp(focus, 1, 5) - 1) / 4) * 100
  const understandingScore = ((clamp(understanding, 1, 5) - 1) / 4) * 100
  const behaviorScore = 100 * (1 - calculateDistractionRatio(session.cameraEvents, session.durationSec))
  return clamp(Math.round(0.35 * focusScore + 0.35 * understandingScore +
    0.20 * clamp(completionPct, 0, 100) + 0.10 * behaviorScore), 0, 100)
}
