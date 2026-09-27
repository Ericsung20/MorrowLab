import type { ActivityCategory, ActivitySegment, CameraEvent, StudyTask } from '../../contracts/morrowlab'

// ponytail: static lists + keyword heuristics, fully local. Swap for an LLM classifier if titles prove too ambiguous.
/** Browser games: [name as it appears in titles, host]. */
const WEB_GAMES: [string, string][] = [
  ['tetr.io', 'tetr.io'], ['jstris', 'jstris.jezevec10.com'], ['chess.com', 'chess.com'], ['lichess', 'lichess.org'],
  ['agar.io', 'agar.io'], ['slither.io', 'slither.io'], ['krunker', 'krunker.io'], ['skribbl', 'skribbl.io'],
  ['gartic', 'gartic.io'], ['geoguessr', 'geoguessr.com'], ['poki', 'poki.com'], ['crazygames', 'crazygames.com'],
]
const DISTRACTION_HOSTS = [
  ...WEB_GAMES.map(([, host]) => host),
  'netflix.com', 'disneyplus.com', 'primevideo.com', 'tving.com', 'wavve.com', 'coupangplay.com', 'watcha.com', 'laftel.net',
  'twitch.tv', 'chzzk.naver.com', 'afreecatv.com', 'sooplive.co.kr', 'kick.com',
  'webtoons.com', 'comic.naver.com', 'webtoon.kakao.com', 'page.kakao.com', 'kakaopage.com', 'lezhin.com', 'toomics.com',
  'instagram.com', 'facebook.com', 'tiktok.com', 'x.com', 'twitter.com', 'threads.net', 'reddit.com', 'pinterest.com', '9gag.com',
  'dcinside.com', 'fmkorea.com', 'theqoo.net', 'ruliweb.com', 'inven.co.kr',
  'store.steampowered.com', 'steamcommunity.com', 'roblox.com', 'poki.com', 'crazygames.com', 'miniclip.com', 'epicgames.com', 'op.gg',
  'coupang.com', 'musinsa.com', 'amazon.com', 'aliexpress.com',
]
const STUDY_HOSTS = [
  'docs.google.com', 'drive.google.com', 'classroom.google.com', 'scholar.google.com', 'notion.so', 'notion.site', 'onenote.com',
  'wikipedia.org', 'khanacademy.org', 'coursera.org', 'edx.org', 'udemy.com', 'inflearn.com', 'brilliant.org', 'ocw.mit.edu',
  'arxiv.org', 'stackoverflow.com', 'github.com', 'developer.mozilla.org', 'w3schools.com', 'geeksforgeeks.org', 'leetcode.com',
  'overleaf.com', 'desmos.com', 'wolframalpha.com', 'symbolab.com', 'quizlet.com', 'instructure.com', 'blackboard.com', 'moodle.org',
  'ebs.co.kr', 'ebsi.co.kr', 'megastudy.net', 'etoos.com', 'mimacstudy.com', 'dict.naver.com', 'papago.naver.com', 'chatgpt.com', 'claude.ai',
]
const STUDY_WORDS = [
  'lecture', 'lesson', 'tutorial', 'course', 'explained', 'explanation', 'how to', 'study', 'exam', 'homework', 'problem', 'solution',
  'calculus', 'algebra', 'geometry', 'statistics', 'probability', 'physics', 'chemistry', 'biology', 'economics', 'history',
  'programming', 'python', 'javascript', 'java', 'algorithm', 'math', 'mathematics', 'science', 'grammar', 'vocabulary',
  'crash course', 'khan academy', 'opencourseware', 'theorem', 'proof', 'chapter',
  '강의', '강좌', '인강', '수업', '개념', '풀이', '문제', '기출', '수능', '내신', '공부', '수학', '미적분', '과학', '물리', '화학', '생명',
  '지구과학', '영어', '국어', '한국사', '사회', '경제', '코딩', '프로그래밍', '알고리즘', '토익', '토플', '문법', '해설', '시험', '정리',
  '미분', '적분', '역사', '논문', '원리', '법칙',
]
const PLAY_WORDS = [
  'music video', 'official video', 'official mv', 'm/v', 'vlog', 'prank', 'highlights', 'gameplay', "let's play", 'reaction',
  'funny', 'meme', 'trailer', 'challenge', 'asmr', 'mukbang', 'unboxing', 'minecraft', 'fortnite', 'league of legends', '#shorts',
  'game', 'games', 'play now', 'multiplayer',
  '먹방', '브이로그', '예능', '하이라이트', '게임', '리액션', '웃긴', '직캠', '뮤비', '드라마', '몰아보기', '썰', '쇼츠', '롤 ', '배그',
]
const TASK_STOPWORDS = new Set(['the', 'and', 'for', 'with', 'homework', 'reading', 'study', 'project', 'review', 'chapter', 'task', '과제', '공부', '숙제'])

const matchesHost = (host: string, list: string[]) => list.some(h => host === h || host.endsWith(`.${h}`))
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** Latin words need word boundaries ("math" must not match "aftermath"); Hangul is matched as a substring. */
function countHits(text: string, words: string[]) {
  return words.filter(w => /[a-z]/.test(w) ? new RegExp(`(^|[^a-z])${escape(w)}($|[^a-z])`).test(text) : text.includes(w)).length
}
function taskTokens(task: StudyTask) {
  return [...new Set(`${task.title} ${task.subject}`.toLowerCase().split(/[^\p{L}\p{N}]+/u)
    .filter(t => (/[a-z]/.test(t) ? t.length >= 3 : t.length >= 2) && !TASK_STOPWORDS.has(t)))]
}

export function matchTask(title: string, tasks: StudyTask[]): string | undefined {
  const text = title.toLowerCase()
  let best: { id: string; hits: number } | undefined
  for (const task of tasks) {
    const hits = countHits(text, taskTokens(task))
    if (hits && (!best || hits > best.hits)) best = { id: task.id, hits }
  }
  return best?.id
}

export function hostOf(url: string | undefined) {
  try { return url ? new URL(url).hostname.replace(/^www\.|^m\./, '') : '' } catch { return '' }
}

/** `ask`: the rules found no evidence either way; this text may be judged by the local AI (aiClassifier.ts). */
export interface Classification { category: ActivityCategory; taskId?: string; ask?: string; studyOverride?: boolean }

/** Decides whether a tab is study, distraction, or unknown (neutral) from its title and URL. */
export function classifyActivity(tab: { title: string; url?: string }, tasks: StudyTask[] = []): Classification {
  const host = hostOf(tab.url)
  const title = tab.title.toLowerCase()
  const taskId = matchTask(tab.title, tasks)
  if (host === 'youtube.com' || host === 'youtu.be') {
    const playlist = !!(tab.url && new URL(tab.url).searchParams.get('list')) || /\bplaylist\b|플레이리스트|플리/.test(title)
    if (playlist) return { category: 'study', taskId, studyOverride: true }
    if (tab.url?.includes('/shorts/')) return { category: 'distraction' }
    const study = countHits(title, STUDY_WORDS), play = countHits(title, PLAY_WORDS)
    const score = study + (taskId ? 2 : 0) - play
    // YouTube is entertainment by default; a video must look academic to count as study.
    if (score > 0) return { category: 'study', taskId }
    return !study && !play ? { category: 'distraction', ask: tab.title.replace(/\s[-–—]\s*youtube\s*$/i, '') } : { category: 'distraction' }
  }
  if (matchesHost(host, DISTRACTION_HOSTS)) return { category: 'distraction' }
  if (taskId || matchesHost(host, STUDY_HOSTS) || /\.pdf($|[?#])/i.test(tab.url ?? '')) return { category: 'study', taskId }
  return looksLikePlay(title) ? { category: 'distraction' } : { category: 'neutral', ask: tab.title }
}

/** Guard for the AI: a title with study words is never judged a distraction. */
export const hasStudyWords = (text: string) => countHits(text.toLowerCase(), STUDY_WORDS) > 0

/** Unlisted page/app whose title reads more like play ("… game", "게임") than study. */
const looksLikePlay = (title: string) => countHits(title, PLAY_WORDS) > countHits(title, STUDY_WORDS)

const BROWSER_APPS = ['chrome', 'msedge', 'edge', 'whale', 'brave', 'opera', 'firefox', 'safari', 'arc', 'vivaldi']
/** Site names as they appear in browser window titles, when no URL is available. */
const TITLE_SITES: [string, string][] = [
  ...WEB_GAMES, ['youtube', 'youtube.com'], ['netflix', 'netflix.com'], ['disney+', 'disneyplus.com'], ['twitch', 'twitch.tv'], ['치지직', 'chzzk.naver.com'],
  ['네이버 웹툰', 'comic.naver.com'], ['webtoon', 'webtoons.com'], ['카카오페이지', 'page.kakao.com'], ['instagram', 'instagram.com'],
  // X page titles end in " / X" ("Home / X", "… on X: \"…\" / X").
  ['/ x', 'x.com'], ['twitter', 'twitter.com'],
  ['facebook', 'facebook.com'], ['tiktok', 'tiktok.com'], ['reddit', 'reddit.com'], ['google docs', 'docs.google.com'],
  ['google 문서', 'docs.google.com'], ['notion', 'notion.so'], ['wikipedia', 'wikipedia.org'], ['khan academy', 'khanacademy.org'],
]
const DISTRACTION_APPS = ['kakaotalk', 'discord', 'telegram', 'whatsapp', 'steam', 'league of legends', 'riot client', 'battle.net',
  'minecraft', 'roblox', 'valorant', 'overwatch', 'maplestory', 'tetr.io', 'tetrio', 'netflix', 'tiktok', 'instagram',
  'fortnite', 'leagueclient', 'leagueclientux', 'dota', 'counter-strike', 'cs2', 'baldur', 'stardew valley', 'hades',
  'terraria', 'genshin', 'honkai', 'civilization', 'slay the spire', 'balatro', 'world of warcraft', 'starcraft', 'hearthstone']
const STUDY_APPS = ['word', 'winword', 'powerpoint', 'powerpnt', 'excel', 'onenote', 'notion', 'obsidian', 'acrobat', 'pdf',
  'visual studio code', 'code', 'pycharm', 'intellij', 'matlab', 'rstudio', 'goodnotes', 'notability', 'zotero', 'anki', 'hwp', '한글', 'xcode']

/** Classifies the foreground window reported by the desktop companion ({ title, app }, url on macOS only). */
export function classifyWindow(win: { title: string; app: string; url?: string }, tasks: StudyTask[] = []): Classification {
  const app = win.app.toLowerCase()
  if (countHits(app, BROWSER_APPS)) {
    // "Video title - YouTube - Google Chrome" → drop the browser suffix, infer the site from the title.
    const title = win.title.replace(/\s[-–—]\s(?:Google Chrome|Chrome|Safari|Mozilla Firefox|Firefox|Microsoft Edge|Brave|Opera|Arc|Vivaldi)(?:\s.*)?$/i, '')
    const site = TITLE_SITES.find(([name]) => countHits(title.toLowerCase(), [name]))?.[1]
    return classifyActivity({ title, url: win.url || (site && `https://${site}/`) }, tasks)
  }
  if (countHits(app, DISTRACTION_APPS)) return { category: 'distraction' }
  const taskId = matchTask(win.title, tasks)
  if (taskId || countHits(app, STUDY_APPS)) return { category: 'study', taskId }
  return looksLikePlay(win.title.toLowerCase()) ? { category: 'distraction' } : { category: 'neutral', ask: win.title }
}

/**
 * Estimates seconds per task: matched screen time goes to its task, unmatched non-distracting time goes to the
 * most recently matched task (e.g. solving problems on paper after reading them on screen), and camera
 * off-task time (phone/away/distracted/talking) is subtracted.
 */
export function estimateTaskTime(segments: ActivitySegment[], cameraEvents: CameraEvent[], tasks: StudyTask[]) {
  const offTask = cameraEvents.filter(e => e.type !== 'studying').map(e => [Date.parse(e.startISO), Date.parse(e.endISO)] as const)
  const known = new Set(tasks.map(t => t.id))
  let current = segments.find(s => s.taskId && known.has(s.taskId))?.taskId ?? (tasks.length === 1 ? tasks[0].id : undefined)
  const totals = new Map<string, number>()
  for (const s of segments) {
    if (s.category === 'distraction') continue
    if (s.taskId && known.has(s.taskId)) current = s.taskId
    if (!current) continue
    const start = Date.parse(s.startISO), end = Date.parse(s.endISO)
    const blocked = s.studyOverride ? 0 : offTask.reduce((sum, [a, b]) => sum + Math.max(0, Math.min(end, b) - Math.max(start, a)), 0)
    totals.set(current, (totals.get(current) ?? 0) + Math.max(0, end - start - blocked) / 1000)
  }
  return [...totals].map(([taskId, seconds]) => ({ taskId, seconds: Math.round(seconds) }))
}
