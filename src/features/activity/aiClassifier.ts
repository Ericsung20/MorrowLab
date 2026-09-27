import type { ActivityCategory } from '../../contracts/morrowlab'
import { hasStudyWords } from './classifyActivity'

/**
 * Local AI for titles the rules can't decide (e.g. "우주는 얼마나 클까?" on YouTube, an unknown game).
 * A small multilingual sentence model (runs in a Web Worker, ~135 MB downloaded once, then cached)
 * compares the title with example phrases for each category. Nothing leaves the device.
 */
export const AI_MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2'
export const PROTOTYPES: Record<'study' | 'play' | 'neutral', string[]> = {
  study: ['online lecture video', 'studying for an exam', 'math problem solving', 'science explained', 'reading a textbook chapter',
    'programming tutorial', 'writing an essay or report', 'online course', 'history lesson', 'research paper', 'language learning',
    '인터넷 강의', '시험 공부', '수학 문제 풀이', '개념 설명 강의', '교과서 공부', '과제 작성', '역사 공부 정리', '한국사 강의', '논문 읽기', '영어 공부', '과학 지식'],
  play: ['playing a video game', 'online game', 'music video', 'watching a TV drama', 'funny videos', 'social media feed', 'celebrity gossip',
    'online shopping', 'webtoon comics', 'streamer live stream', 'movie trailer', 'esports highlights',
    '게임 플레이', '웃긴 영상', '예능 방송', '아이돌 뮤직비디오', '쇼핑몰', '웹툰 보기', '인터넷 방송', '게임 하이라이트', '드라마 몰아보기'],
  // Everyday tools, so "Settings" or "Weather" aren't forced into study or play.
  neutral: ['settings', 'email inbox', 'calendar', 'weather forecast', 'file explorer', 'new tab', 'system preferences', 'login page',
    'search results', 'downloads', '설정', '메일함', '달력', '날씨', '파일 탐색기', '새 탭', '로그인', '검색 결과'],
}
/** Winning category must beat the runner-up by this much (cosine similarity); otherwise it's "unknown". Tuning knob. */
export const AI_MARGIN = 0.02

/** scores: mean of the top-3 similarities per category. */
export function decideCategory(scores: Record<keyof typeof PROTOTYPES, number>, text: string, margin = AI_MARGIN): ActivityCategory {
  const [[top, best], [, second]] = Object.entries(scores).sort((a, b) => b[1] - a[1])
  if (top === 'neutral' || best - second < margin) return 'neutral'
  // Wrongly calling study a distraction is the costlier mistake.
  if (top === 'play') return hasStudyWords(text) ? 'neutral' : 'distraction'
  return 'study'
}

export interface AiClassifier {
  /** Answer already known for this text, if any. */
  cached(text: string): ActivityCategory | undefined
  classify(text: string): Promise<ActivityCategory>
}

/** One shared worker for the page; answers are remembered per title. */
export function createAiClassifier(): AiClassifier | null {
  if (typeof Worker === 'undefined') return null
  let worker: Worker | null = null
  let broken = false
  let nextId = 0
  const done = new Map<string, ActivityCategory>()
  const pending = new Map<string, Promise<ActivityCategory>>()
  const waiting = new Map<number, (category: ActivityCategory) => void>()
  const start = () => {
    worker = new Worker(new URL('./aiWorker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<{ id: number; category: ActivityCategory }>) => {
      waiting.get(e.data.id)?.(e.data.category)
      waiting.delete(e.data.id)
    }
    // Model download/initialization failed: fall back to rules only.
    worker.onerror = () => { broken = true; for (const resolve of waiting.values()) resolve('neutral'); waiting.clear() }
  }
  return {
    cached: text => done.get(text),
    classify(text) {
      const known = done.get(text) ?? pending.get(text)
      if (known) return Promise.resolve(known)
      if (broken || !text.trim()) return Promise.resolve('neutral')
      if (!worker) start()
      const id = nextId++
      const answer = new Promise<ActivityCategory>(resolve => {
        waiting.set(id, resolve)
        worker!.postMessage({ id, text })
      }).then(category => { done.set(text, category); pending.delete(text); return category })
      pending.set(text, answer)
      return answer
    },
  }
}

let shared: AiClassifier | null | undefined
/** Lazily created so pages that never classify don't load the model. */
export const sharedAiClassifier = () => (shared === undefined ? (shared = createAiClassifier()) : shared)
