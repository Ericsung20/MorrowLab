/// <reference lib="webworker" />
// Runs the local sentence model off the main thread (see aiClassifier.ts).
import { env, pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers'
import { AI_MODEL, PROTOTYPES, decideCategory } from './aiClassifier'

// Models come from the Hugging Face hub and are cached by the browser; never look for them on our own server.
env.allowLocalModels = false

type Vector = number[]
const cos = (a: Vector, b: Vector) => a.reduce((s, x, i) => s + x * b[i], 0)
const ready = (async () => {
  const embed = (await pipeline('feature-extraction', AI_MODEL, { dtype: 'q8' })) as FeatureExtractionPipeline
  const vectors = async (texts: string[]) => (await embed(texts, { pooling: 'mean', normalize: true })).tolist() as Vector[]
  const prototypes = Object.fromEntries(await Promise.all(
    Object.entries(PROTOTYPES).map(async ([k, texts]) => [k, await vectors(texts)] as const))) as Record<keyof typeof PROTOTYPES, Vector[]>
  return { vectors, prototypes }
})()

self.onmessage = async (e: MessageEvent<{ id: number; text: string }>) => {
  try {
    const { vectors, prototypes } = await ready
    const [v] = await vectors([e.data.text])
    const top3 = (set: Vector[]) => set.map(p => cos(v, p)).sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0) / 3
    const scores = { study: top3(prototypes.study), play: top3(prototypes.play), neutral: top3(prototypes.neutral) }
    self.postMessage({ id: e.data.id, category: decideCategory(scores, e.data.text) })
  } catch (error) {
    // Model unavailable (offline on first use, blocked download…): the rules' answer stands.
    console.warn('MorrowLab AI classifier unavailable:', error)
    self.postMessage({ id: e.data.id, category: 'neutral' })
  }
}
