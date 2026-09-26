import 'fake-indexeddb/auto'
import { act, renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { useStudySensors } from '../features/sensors/useStudySensors'
import { createLocalMorrowLabDataService } from '../services/localMorrowLabDataService'
import { MorrowLabDB } from './db'

it('persists final sensor output and scores a session when no camera is available', async () => {
  // Keep IndexedDB's asynchronous scheduling real while controlling wall-clock time.
  vi.useFakeTimers({ toFake: ['Date'] })
  const start = new Date('2026-09-26T15:00:00Z').getTime()
  vi.setSystemTime(start)
  const db = new MorrowLabDB(`sensor-integration-${crypto.randomUUID()}`)
  const service = createLocalMorrowLabDataService(db)
  const videoRef = { current: null }
  const { result, unmount } = renderHook(() => useStudySensors(videoRef))
  try {
    const task = await service.createTask({ title: 'Integration task', subject: 'Math',
      estimatedMinutes: 30, deadlineISO: '2026-09-27T23:00:00Z' })
    const session = await service.startSession(task.id)
    await act(() => result.current.start())
    expect(result.current.status).toBe('error')
    act(() => result.current.simulatePhone(5))
    vi.setSystemTime(start + 5000)
    act(() => result.current.simulateAway(5))
    vi.setSystemTime(start + 7000)
    let sensorOutput!: ReturnType<typeof result.current.stop>
    act(() => { sensorOutput = result.current.stop() })
    const finished = await service.finishSession(session.id, { ...sensorOutput,
      reflection: { focus: 5, understanding: 5, completionPct: 80 } })
    expect(finished.durationSec).toBe(7)
    expect(finished.cameraEvents.map(e => [e.type, e.durationSec])).toEqual([['phone', 5], ['away', 2]])
    expect(finished.activitySegments.length).toBeGreaterThan(0)
    expect(finished.score).toBe(86)
    db.close()
    await db.open()
    expect(await service.getSession(session.id)).toEqual(finished)
    expect((await service.getInsights())[0]).toContain('86/100')
    expect((await service.getTomorrowRecommendations())[0].taskId).toBe(task.id)
  } finally {
    unmount()
    await db.delete()
    vi.useRealTimers()
  }
})
