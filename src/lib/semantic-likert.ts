import { generateEmbedding, generateEmbeddings } from '@/lib/gemini'

export const USAGE_INTENT_ANCHORS: [string, string, string, string, string] = [
  '我完全不會用這個，跟我的生活沒關係，看了也沒感覺。',
  '我應該不會用，感覺不太符合我需求，沒什麼吸引力。',
  '還可以，看情況，不一定會用，也不反感。',
  '我蠻想試試看，這個應該會符合我需求，會想用。',
  '我一定會用，這個完全打中我，看了就覺得超適合我。',
]

export const DEFAULT_SOFTMAX_TEMPERATURE = 0.08

export interface SemanticLikertResult {
  likert: 1 | 2 | 3 | 4 | 5
  score: number
  similarities: number[]
}

let cachedAnchorEmbeddings: Promise<number[][]> | null = null

export async function getAnchorEmbeddings(): Promise<number[][]> {
  if (!cachedAnchorEmbeddings) {
    cachedAnchorEmbeddings = generateEmbeddings([...USAGE_INTENT_ANCHORS]).catch(err => {
      cachedAnchorEmbeddings = null
      throw err
    })
  }
  return cachedAnchorEmbeddings
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom === 0 ? 0 : dot / denom
}

function softmax(values: number[], temperature: number): number[] {
  const scaled = values.map(v => v / temperature)
  const max = Math.max(...scaled)
  const exps = scaled.map(v => Math.exp(v - max))
  const sum = exps.reduce((a, b) => a + b, 0)
  return exps.map(e => e / sum)
}

export function mapToLikert(
  similarities: number[],
  temperature = DEFAULT_SOFTMAX_TEMPERATURE
): SemanticLikertResult {
  if (similarities.length !== 5) {
    throw new Error(`expected 5 similarities, got ${similarities.length}`)
  }
  const weights = softmax(similarities, temperature)
  const score = weights.reduce((sum, w, i) => sum + w * (i + 1), 0)
  let argmaxIdx = 0
  for (let i = 1; i < similarities.length; i++) {
    if (similarities[i] > similarities[argmaxIdx]) argmaxIdx = i
  }
  return {
    likert: (argmaxIdx + 1) as 1 | 2 | 3 | 4 | 5,
    score,
    similarities,
  }
}

export async function scoreUsageIntent(
  reactionText: string,
  options: { temperature?: number } = {}
): Promise<SemanticLikertResult> {
  const anchorEmbeddings = await getAnchorEmbeddings()
  const reactionEmbedding = await generateEmbedding(reactionText)
  const similarities = anchorEmbeddings.map(anchor => cosine(reactionEmbedding, anchor))
  return mapToLikert(similarities, options.temperature)
}
