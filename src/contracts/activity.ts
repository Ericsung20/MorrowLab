/** Stable labels persisted in ActivitySegment without changing the service contract. */
export const ACTIVITY_LABELS = {
  active: 'MorrowLab active',
  other: 'Other tab/window',
  research: 'Study: research (self-reported)',
  lecture: 'Study: lecture (self-reported)',
} as const
export type StudyActivityMode = 'strict' | 'research' | 'lecture'
