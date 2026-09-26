import type { StudyRecommendation, StudySession, StudyTask } from '../../contracts/morrowlab'
import { analyzeSessions, type PatternStats } from '../analytics/analyzeSessions'
import { getTimeBucket, type TimeBucket } from '../analytics/getTimeBucket'
import { clamp } from '../scoring/calculateSessionScore'

export const CANDIDATE_TIMES = ['09:00', '10:30', '13:30', '15:00', '18:30', '20:00'] as const

/** One completed session is sufficient for an initial, explicitly sample-sized estimate. */
export function getTimeFit(subject: string, timeBucket: TimeBucket, analytics: ReturnType<typeof analyzeSessions>) {
  const subjectStats = analytics.subjectPatterns.find(p => p.subject === subject && p.timeBucket === timeBucket)
  const stats = subjectStats ?? analytics.timeBucketPatterns.find(p => p.timeBucket === timeBucket)
  return {
    timeFit: stats ? clamp(0.8 * stats.averageScore / 100 + 0.2 * (1 - stats.averageDistractionRatio), 0, 1) : 0.5,
    source: subjectStats ? 'subject' as const : stats ? 'overall' as const : 'neutral' as const,
    stats,
  }
}

export function compareTimeFit(subject: string, timeBucket: TimeBucket, previous: StudySession[], current: StudySession[]) {
  const previousFit = getTimeFit(subject, timeBucket, analyzeSessions(previous)).timeFit
  const currentFit = getTimeFit(subject, timeBucket, analyzeSessions(current)).timeFit
  return { previousFit, currentFit, delta: currentFit - previousFit }
}

export function calculateUrgency(deadlineISO: string, tomorrowStart: Date): number {
  return clamp(1 - (new Date(deadlineISO).getTime() - tomorrowStart.getTime()) / 3_600_000 / 168, 0, 1)
}

function localDateISO(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function patternReason(subject: string, bucket: TimeBucket, stats: PatternStats | undefined, source: 'subject' | 'overall' | 'neutral') {
  if (source === 'subject' && stats) return `${subject} sessions average ${Math.round(stats.averageScore)}/100 in the ${bucket} (${stats.sessionCount} completed session${stats.sessionCount === 1 ? '' : 's'}).`
  if (stats) return `Not enough ${subject} history in the ${bucket} yet, so this uses your overall ${bucket} pattern (${Math.round(stats.averageScore)}/100 across ${stats.sessionCount} sessions).`
  return `No ${bucket} history yet; this uses a neutral time-fit estimate until more sessions are completed.`
}

/** Scores are 0–1. Dates and candidate times are local. Unplaceable tasks are omitted. */
export function generateTomorrowRecommendations(tasks: StudyTask[], sessions: StudySession[], now = new Date()): StudyRecommendation[] {
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)
  const nextDay = new Date(tomorrow)
  nextDay.setDate(nextDay.getDate() + 1)
  const analytics = analyzeSessions(sessions)
  const ordered = tasks.filter(t => t.status === 'todo')
    .map(task => ({ task, urgency: calculateUrgency(task.deadlineISO, tomorrow) }))
    .sort((a, b) => b.urgency - a.urgency || new Date(a.task.deadlineISO).getTime() - new Date(b.task.deadlineISO).getTime() || a.task.id.localeCompare(b.task.id))
  const occupied: { start: number; end: number }[] = []
  const recommendations: StudyRecommendation[] = []
  for (const { task, urgency } of ordered) {
    if (!Number.isFinite(task.estimatedMinutes) || task.estimatedMinutes <= 0) continue
    const candidates = CANDIDATE_TIMES.map(startTime => {
      const [hour, minute] = startTime.split(':').map(Number)
      const start = new Date(tomorrow)
      start.setHours(hour, minute, 0, 0)
      const end = start.getTime() + task.estimatedMinutes * 60_000
      const bucket = getTimeBucket(start)
      const fit = getTimeFit(task.subject, bucket, analytics)
      return { startTime, start: start.getTime(), end, bucket, ...fit, score: 0.65 * fit.timeFit + 0.35 * urgency }
    }).filter(c => c.end <= nextDay.getTime() && !occupied.some(o => c.start < o.end && c.end > o.start))
      .sort((a, b) => b.score - a.score || a.start - b.start)
    const best = candidates[0]
    if (!best) continue
    occupied.push({ start: best.start, end: best.end })
    const reasons = [patternReason(task.subject, best.bucket, best.stats, best.source)]
    if (best.stats) reasons.push(`Recorded phone or away time averages ${Math.round(best.stats.averageDistractionRatio * 100)}% in this pattern.`)
    const deadline = new Date(task.deadlineISO).getTime()
    reasons.push(deadline <= tomorrow.getTime() ? 'This task is due by the start of tomorrow, so it has maximum urgency.' :
      urgency >= 0.7 ? 'This task has an approaching deadline.' : 'Deadline urgency is balanced with your recent study patterns.')
    if (deadline < best.end && deadline > tomorrow.getTime()) reasons.push('This block ends after the task deadline; consider working on it earlier.')
    recommendations.push({ taskId: task.id, taskTitle: task.title, subject: task.subject,
      dateISO: localDateISO(tomorrow), startTime: best.startTime, estimatedMinutes: task.estimatedMinutes,
      recommendationScore: best.score, reasons })
  }
  return recommendations.sort((a, b) => a.startTime.localeCompare(b.startTime))
}
