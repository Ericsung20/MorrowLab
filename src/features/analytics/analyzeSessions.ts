import type { StudySession } from '../../contracts/morrowlab'
import { calculateDistractionRatio } from '../scoring/calculateSessionScore'
import { getTimeBucket, type TimeBucket } from './getTimeBucket'

export interface PatternStats {
  subject?: string
  timeBucket: TimeBucket
  sessionCount: number
  averageScore: number
  averageDistractionRatio: number
  averageFocus: number
  averageUnderstanding: number
  averageCompletion: number
}

export function completedSessions(sessions: StudySession[]) {
  return sessions.filter((s): s is StudySession & { reflection: NonNullable<StudySession['reflection']>; score: number } =>
    !!s.endedAtISO && !!s.reflection && Number.isFinite(s.score) &&
    Number.isFinite(new Date(s.startedAtISO).getTime()))
}

export function analyzeSessions(sessions: StudySession[]): { subjectPatterns: PatternStats[]; timeBucketPatterns: PatternStats[] } {
  const subjectGroups = new Map<string, PatternStats>()
  const globalGroups = new Map<string, PatternStats>()
  for (const session of completedSessions(sessions)) {
    const timeBucket = getTimeBucket(session.startedAtISO)
    for (const [map, key, subject] of [
      [subjectGroups, JSON.stringify([session.subject, timeBucket]), session.subject],
      [globalGroups, timeBucket, undefined],
    ] as const) {
      const stats = map.get(key) ?? { subject, timeBucket, sessionCount: 0, averageScore: 0,
        averageDistractionRatio: 0, averageFocus: 0, averageUnderstanding: 0, averageCompletion: 0 }
      stats.sessionCount++
      stats.averageScore += session.score
      stats.averageDistractionRatio += calculateDistractionRatio(session.cameraEvents, session.durationSec)
      stats.averageFocus += session.reflection.focus
      stats.averageUnderstanding += session.reflection.understanding
      stats.averageCompletion += session.reflection.completionPct
      map.set(key, stats)
    }
  }
  const averages = (groups: Map<string, PatternStats>) => [...groups.values()].map(s => ({ ...s,
    averageScore: s.averageScore / s.sessionCount,
    averageDistractionRatio: s.averageDistractionRatio / s.sessionCount,
    averageFocus: s.averageFocus / s.sessionCount,
    averageUnderstanding: s.averageUnderstanding / s.sessionCount,
    averageCompletion: s.averageCompletion / s.sessionCount,
  }))
  return { subjectPatterns: averages(subjectGroups), timeBucketPatterns: averages(globalGroups) }
}
