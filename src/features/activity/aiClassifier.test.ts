import { expect, it } from 'vitest'
import { decideCategory } from './aiClassifier'

it('turns similarity scores into a category, preferring "unknown" when unsure', () => {
  expect(decideCategory({ study: 0.44, play: 0.14, neutral: 0.23 }, 'Introduction to Linear Algebra')).toBe('study')
  expect(decideCategory({ study: 0.66, play: 0.85, neutral: 0.65 }, '런닝맨 풀버전')).toBe('distraction')
  expect(decideCategory({ study: 0.15, play: 0.28, neutral: 0.71 }, 'Weather forecast')).toBe('neutral')
  // Too close to call.
  expect(decideCategory({ study: 0.34, play: 0.35, neutral: 0.31 }, 'Among Us with friends')).toBe('neutral')
})

it('never calls a title with study words a distraction', () => {
  // Measured: the model leans "play" on this short Korean title.
  expect(decideCategory({ study: 0.68, play: 0.81, neutral: 0.6 }, '한국사 조선 후기 정리')).toBe('neutral')
  expect(decideCategory({ study: 0.74, play: 0.84, neutral: 0.67 }, '미분 적분 기초')).toBe('neutral')
})
