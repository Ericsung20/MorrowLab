import { describe, expect, it } from 'vitest'
import type { CameraEvent, StudySession } from '../../contracts/morrowlab'
import { createDemoWorkspace } from '../../db/demoWorkspace'
import { calculateDistractionRatio, calculateSessionScore } from '../scoring/calculateSessionScore'
import { getTimeBucket } from './getTimeBucket'
import { analyzeSessions } from './analyzeSessions'
import { generateInsights } from '../insights/generateInsights'
import { calculateUrgency, compareTimeFit, generateTomorrowRecommendations, getTimeFit } from '../recommendations/recommendationEngine'

const now = new Date(2026, 8, 26, 12)
const event = (durationSec: number): CameraEvent => ({ id: 'event', type: 'phone', durationSec,
  startISO: now.toISOString(), endISO: now.toISOString(), confidence: 1, source: 'manual' })
const score = (focus: number, understanding: number, completionPct: number, durationSec = 100, cameraEvents: CameraEvent[] = []) =>
  calculateSessionScore({ reflection: { focus, understanding, completionPct }, durationSec, cameraEvents })

describe('Session Score', () => {
  it('scores perfect reflection and behavior at 100', () => expect(score(5, 5, 100)).toBe(100))
  it('gives poor reflection only the behavior contribution', () => expect(score(1, 1, 0)).toBe(10))
  it('caps interruptions at the session duration', () => {
    expect(score(5, 5, 100, 100, [event(200)])).toBe(90)
    expect(score(1, 1, 0, 100, [event(100)])).toBe(0)
  })
  it('uses the specified weighted calculation', () => expect(score(4, 3, 80, 100, [event(20)])).toBe(68))
  it('bounds scores and handles zero duration and malformed numeric values', () => {
    expect(score(100, 100, 1000)).toBe(100)
    expect(score(-100, -100, -100, 0, [event(1)])).toBe(0)
    expect(score(NaN, NaN, NaN, 0)).toBe(10)
    expect(calculateDistractionRatio([event(-10)], 0)).toBe(0)
  })
  it('requires a reflection', () => expect(() => calculateSessionScore({ durationSec: 0, cameraEvents: [] })).toThrow('reflection'))
})

describe('local time buckets', () => {
  it.each([[5, 59, 'evening'], [6, 0, 'morning'], [11, 59, 'morning'], [12, 0, 'afternoon'], [17, 59, 'afternoon'], [18, 0, 'evening']] as const)(
    '%i:%i is %s', (hour, minute, bucket) => expect(getTimeBucket(new Date(2026, 8, 26, hour, minute))).toBe(bucket))
  it('rejects an invalid date', () => expect(() => getTimeBucket('invalid')).toThrow('valid date'))
})

describe('analytics and insights', () => {
  it('computes subject and global means and ignores unfinished/unrated sessions', () => {
    const { sessions } = createDemoWorkspace(now)
    const ignored = [{ ...sessions[0], reflection: undefined }, { ...sessions[0], score: undefined }, { ...sessions[0], endedAtISO: undefined }]
    const result = analyzeSessions([...sessions, ...ignored])
    const math = result.subjectPatterns.find(p => p.subject === 'Math' && p.timeBucket === 'morning')!
    expect(math.sessionCount).toBe(3)
    expect(math.averageScore).toBe(89)
    expect(math.averageFocus).toBeCloseTo(14 / 3)
    expect(math.averageUnderstanding).toBeCloseTo(13 / 3)
    expect(math.averageCompletion).toBeCloseTo(275 / 3)
    expect(math.averageDistractionRatio).toBeCloseTo((60 / 2700 + 300 / 2400 + 60 / 3000) / 3)
    expect(result.timeBucketPatterns.reduce((sum, p) => sum + p.sessionCount, 0)).toBe(7)
  })
  it('includes zero scores', () => {
    const { sessions } = createDemoWorkspace(now)
    expect(analyzeSessions([{ ...sessions[0], score: 0 }]).subjectPatterns[0].averageScore).toBe(0)
  })
  it('derives insights from the given scores', () => {
    const { sessions } = createDemoWorkspace(now)
    const insights = generateInsights(sessions)
    expect(insights.length).toBeGreaterThanOrEqual(2)
    expect(insights.join(' ')).toContain('Math has its highest average Session Score in the morning (89/100')
    expect(generateInsights(sessions.map(s => ({ ...s, score: 0 })))[0]).toContain('0/100')
    expect(generateInsights([])).toHaveLength(2)
  })
})

describe('demo history', () => {
  it('creates three future tasks and seven scored historical sessions', () => {
    const { tasks, sessions } = createDemoWorkspace(now)
    expect(tasks).toHaveLength(3)
    expect(tasks.every(t => t.status === 'todo' && new Date(t.deadlineISO) > now)).toBe(true)
    expect(sessions).toHaveLength(7)
    expect(sessions.map(s => s.score)).toEqual([91, 87, 89, 61, 82, 78, 75])
    for (const session of sessions) {
      expect(session.isDemoHistory).toBe(true)
      expect(new Date(session.endedAtISO!) < now).toBe(true)
      expect(session.score).toBe(calculateSessionScore(session))
      expect(session.cameraEvents.reduce((sum, e) => sum + e.durationSec, 0)).toBe(session.durationSec)
    }
  })
})

describe('recommendations', () => {
  it('prefers strong Math mornings over weak evenings', () => {
    const { tasks, sessions } = createDemoWorkspace(now)
    const recommendations = generateTomorrowRecommendations(tasks, sessions, now)
    expect(recommendations).toHaveLength(3)
    expect(recommendations.find(r => r.subject === 'Math')!.startTime).toBe('09:00')
    expect(recommendations.every(r => r.reasons.length > 0 && r.dateISO === '2026-09-27')).toBe(true)
  })
  it('gives an urgent task first access to the best slot', () => {
    const { tasks, sessions } = createDemoWorkspace(now)
    const tomorrow = new Date(2026, 8, 27)
    const lessUrgent = { ...tasks[0], id: 'later', estimatedMinutes: 120, deadlineISO: new Date(2026, 9, 20).toISOString() }
    const urgent = { ...lessUrgent, id: 'urgent', deadlineISO: tomorrow.toISOString() }
    const result = generateTomorrowRecommendations([lessUrgent, urgent], sessions, now)
    expect(result.find(r => r.taskId === 'urgent')!.startTime).toBe('09:00')
    expect(result.find(r => r.taskId === 'later')!.startTime).not.toBe('10:30')
    expect(calculateUrgency(urgent.deadlineISO, tomorrow)).toBe(1)
    expect(calculateUrgency(lessUrgent.deadlineISO, tomorrow)).toBe(0)
  })
  it('uses global patterns for an unknown subject', () => {
    const { tasks, sessions } = createDemoWorkspace(now)
    const result = generateTomorrowRecommendations([{ ...tasks[0], subject: 'Art' }], sessions, now)
    expect(result[0].reasons[0]).toContain('overall morning pattern')
    expect(getTimeFit('Art', 'morning', analyzeSessions(sessions)).source).toBe('overall')
  })
  it('returns a neutral schedule without history, excluding done tasks', () => {
    const { tasks } = createDemoWorkspace(now)
    const result = generateTomorrowRecommendations([...tasks, { ...tasks[0], id: 'done', status: 'done' }], [], now)
    expect(result).toHaveLength(3)
    expect(result[0].reasons[0]).toContain('neutral')
    expect(result.every(r => r.recommendationScore >= 0 && r.recommendationScore <= 1)).toBe(true)
  })
  it('never overlaps long tasks or schedules past midnight, and is deterministic', () => {
    const { tasks } = createDemoWorkspace(now)
    const many = Array.from({ length: 8 }, (_, i) => ({ ...tasks[0], id: String(i), estimatedMinutes: 120 }))
    const result = generateTomorrowRecommendations(many, [], now)
    expect(result.length).toBeLessThan(many.length)
    const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3))
    result.forEach((r, i) => {
      expect(minutes(r.startTime) + r.estimatedMinutes).toBeLessThanOrEqual(1440)
      if (i) expect(minutes(r.startTime)).toBeGreaterThanOrEqual(minutes(result[i - 1].startTime) + result[i - 1].estimatedMinutes)
    })
    expect(generateTomorrowRecommendations(many, [], now)).toEqual(result)
    expect(generateTomorrowRecommendations([{ ...tasks[0], estimatedMinutes: 1000 }], [], now)).toEqual([])
  })
  it('reports real time-fit changes after new history', () => {
    const { sessions } = createDemoWorkspace(now)
    const latest: StudySession = { ...sessions[0], id: 'latest', score: 100, cameraEvents: [] }
    const delta = compareTimeFit('Math', 'morning', sessions, [...sessions, latest])
    expect(delta.currentFit).toBeGreaterThan(delta.previousFit)
    expect(delta.delta).toBeCloseTo(delta.currentFit - delta.previousFit)
    expect(compareTimeFit('Math', 'morning', sessions, sessions).delta).toBe(0)
  })
  it('handles local year boundaries', () => {
    const { tasks } = createDemoWorkspace(now)
    expect(generateTomorrowRecommendations(tasks, [], new Date(2026, 11, 31, 23))[0].dateISO).toBe('2027-01-01')
  })
})
