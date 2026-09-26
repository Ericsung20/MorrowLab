import type { StudySession } from '../../contracts/morrowlab'
import { analyzeSessions, completedSessions } from '../analytics/analyzeSessions'

/** Rule-based observations, capped at four. Empty history yields honest onboarding guidance. */
export function generateInsights(sessions: StudySession[]): string[] {
  const completed = completedSessions(sessions)
  if (!completed.length) return [
    'No completed sessions with reflections yet; study patterns will appear after your first session.',
    'Rate your focus and understanding after studying to build your personal history.',
  ]
  const { subjectPatterns, timeBucketPatterns } = analyzeSessions(completed)
  const average = completed.reduce((sum, s) => sum + s.score, 0) / completed.length
  const insights = [`Based on your ${completed.length} recent completed session${completed.length === 1 ? '' : 's'}, your average Session Score is ${Math.round(average)}/100.`]
  for (const subject of [...new Set(subjectPatterns.map(p => p.subject))]) {
    const patterns = subjectPatterns.filter(p => p.subject === subject).sort((a, b) => b.averageScore - a.averageScore)
    const best = patterns[0]
    if (patterns.length > 1 && best.averageScore > patterns[1].averageScore) {
      insights.push(`Based on your recent sessions, ${subject} has its highest average Session Score in the ${best.timeBucket} (${Math.round(best.averageScore)}/100 across ${best.sessionCount} sessions).`)
    }
  }
  const sorted = [...timeBucketPatterns].sort((a, b) => a.averageDistractionRatio - b.averageDistractionRatio)
  const low = sorted[0], high = sorted[sorted.length - 1]
  const difference = Math.round((high.averageDistractionRatio - low.averageDistractionRatio) * 100)
  if (difference > 0) insights.push(`In your recent sessions, the share of time recorded as phone or away was ${difference} percentage points lower in the ${low.timeBucket} than in the ${high.timeBucket}.`)
  if (insights.length === 1) insights.push(`Your recent sessions average ${ (completed.reduce((sum, s) => sum + s.reflection.focus, 0) / completed.length).toFixed(1)}/5 self-rated focus; more sessions will help compare study times.`)
  return insights.slice(0, 4)
}
