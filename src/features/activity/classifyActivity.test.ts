import { describe, expect, it } from 'vitest'
import type { ActivitySegment, CameraEvent, StudyTask } from '../../contracts/morrowlab'
import { classifyActivity, classifyWindow, estimateTaskTime } from './classifyActivity'

const task = (id: string, title: string, subject: string): StudyTask =>
  ({ id, title, subject, estimatedMinutes: 30, deadlineISO: '', createdAtISO: '', status: 'todo' })
const tasks = [task('calc', 'Calculus Homework', 'Math'), task('bio', '세포 호흡 정리', '생명과학')]
const yt = (title: string, path = '/watch?v=1') => classifyActivity({ title: `${title} - YouTube`, url: `https://www.youtube.com${path}` }, tasks)

describe('classifyActivity', () => {
  it('judges YouTube videos by title', () => {
    expect(yt('MIT 18.01 Single Variable Calculus, Lecture 1')).toEqual({ category: 'study', taskId: 'calc' })
    expect(yt('[수학] 미적분 개념 강의 1강').category).toBe('study')
    expect(yt('세포 호흡 한 번에 정리').taskId).toBe('bio')
    expect(yt('NewJeans Official MV').category).toBe('distraction')
    expect(yt('롤 하이라이트 모음').category).toBe('distraction')
    expect(yt('Funny cat compilation').category).toBe('distraction')
    expect(yt('Study with me', '/shorts/abc').category).toBe('distraction')
  })
  it('flags entertainment sites and credits study sites and task-related pages', () => {
    for (const url of ['https://www.netflix.com/browse', 'https://comic.naver.com/webtoon', 'https://www.webtoons.com/en', 'https://poki.com/', 'https://www.instagram.com/'])
      expect(classifyActivity({ title: 'x', url }).category).toBe('distraction')
    expect(classifyActivity({ title: 'Notes', url: 'https://docs.google.com/document/d/1' }).category).toBe('study')
    expect(classifyActivity({ title: 'lecture3.pdf', url: 'file:///C:/notes/lecture3.pdf' }).category).toBe('study')
    expect(classifyActivity({ title: 'Calculus chain rule practice', url: 'https://example.com' }, tasks)).toEqual({ category: 'study', taskId: 'calc' })
    expect(classifyActivity({ title: 'Weather', url: 'https://weather.com' }, tasks).category).toBe('neutral')
  })
  it('matches whole words only', () => {
    expect(classifyActivity({ title: 'The aftermath', url: 'https://example.com' }, tasks).category).toBe('neutral')
  })
})

describe('classifyWindow (desktop companion)', () => {
  const chrome = (title: string) => classifyWindow({ title: `${title} - Google Chrome`, app: 'Google Chrome chrome.exe' }, tasks)
  it('reads the site and video title from browser window titles', () => {
    expect(chrome('MIT Calculus Lecture 1 - YouTube')).toEqual({ category: 'study', taskId: 'calc' })
    expect(chrome('NewJeans Official MV - YouTube').category).toBe('distraction')
    expect(chrome('Netflix').category).toBe('distraction')
    expect(chrome('네이버 웹툰').category).toBe('distraction')
    expect(chrome('Essay draft - Google Docs').category).toBe('study')
    expect(chrome('Weather forecast').category).toBe('neutral')
    // macOS reports the real URL; it wins over title guessing.
    expect(classifyWindow({ title: 'Home', app: 'Safari', url: 'https://www.netflix.com/browse' }).category).toBe('distraction')
  })
  it('classifies desktop apps by name and task-related document titles', () => {
    expect(classifyWindow({ title: '친구', app: 'KakaoTalk KakaoTalk.exe' }).category).toBe('distraction')
    expect(classifyWindow({ title: 'League of Legends', app: 'League of Legends LeagueClient.exe' }).category).toBe('distraction')
    expect(classifyWindow({ title: 'report.docx - Word', app: 'Microsoft Word WINWORD.EXE' }).category).toBe('study')
    expect(classifyWindow({ title: 'Calculus notes.pdf', app: 'Some Viewer viewer.exe' }, tasks)).toEqual({ category: 'study', taskId: 'calc' })
    expect(classifyWindow({ title: 'Settings', app: 'Settings' }).category).toBe('neutral')
  })
})

describe('estimateTaskTime', () => {
  const at = (s: number) => new Date(Date.UTC(2026, 8, 26, 9, 0, s)).toISOString()
  const seg = (from: number, to: number, patch: Partial<ActivitySegment>): ActivitySegment =>
    ({ id: `${from}`, label: 'x', startISO: at(from), endISO: at(to), durationSec: to - from, source: 'browser', ...patch })
  const cam = (type: CameraEvent['type'], from: number, to: number): CameraEvent =>
    ({ id: `${from}`, type, startISO: at(from), endISO: at(to), durationSec: to - from, confidence: 1, source: 'model' })

  it('credits matched tabs, carries off-screen work to the last task, and skips distractions and off-task camera time', () => {
    const segments = [
      seg(0, 100, { category: 'study' }), // MorrowLab open before any task tab: backfilled to the first task
      seg(100, 400, { category: 'study', taskId: 'calc' }),
      seg(400, 500, { category: 'distraction' }),
      seg(500, 700, { category: 'study', taskId: 'bio' }),
      seg(700, 1000, { category: 'study' }), // back on MorrowLab, writing on paper
    ]
    expect(estimateTaskTime(segments, [cam('phone', 750, 800)], tasks)).toEqual([
      { taskId: 'calc', seconds: 400 },
      { taskId: 'bio', seconds: 450 },
    ])
  })
  it('assigns everything to the only task, and nothing when the task is unknown', () => {
    expect(estimateTaskTime([seg(0, 60, { category: 'neutral' })], [], [tasks[0]])).toEqual([{ taskId: 'calc', seconds: 60 }])
    expect(estimateTaskTime([seg(0, 60, { category: 'neutral' })], [], tasks)).toEqual([])
  })
})
