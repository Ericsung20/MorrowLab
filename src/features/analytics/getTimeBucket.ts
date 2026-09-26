export type TimeBucket = 'morning' | 'afternoon' | 'evening'

/** Uses the user's local time; midnight through 05:59 belongs to evening. */
export function getTimeBucket(date: Date | string): TimeBucket {
  const parsed = typeof date === 'string' ? new Date(date) : date
  if (!Number.isFinite(parsed.getTime())) throw new Error('A valid date is required for a time bucket.')
  const hour = parsed.getHours()
  return hour >= 6 && hour < 12 ? 'morning' : hour >= 12 && hour < 18 ? 'afternoon' : 'evening'
}
