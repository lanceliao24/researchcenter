import fs from 'fs'
import path from 'path'
import { storePath } from './paths'

export interface Contradiction {
  topic: string                  // 精簡標籤，如「ETA 準確度」
  promoter_view: string          // promoter 對該主題的觀感（用詞）
  detractor_view: string         // detractor 對該主題的觀感
  scenario_hypothesis: string    // 場景化假設：為什麼會出現分歧
  promoter_evidence: string[]    // 引用片段
  detractor_evidence: string[]
}

export interface ServiceCounterInsights {
  service: string
  serviceLabel: string
  month: string
  promoterCount: number
  detractorCount: number
  contradictions: Contradiction[]
  summary: string
}

export interface CounterInsightsSnapshot {
  generatedAt: string
  byService: ServiceCounterInsights[]
}

const SNAPSHOT_PATH = storePath('counter-insights.json')

export function readCounterInsights(): CounterInsightsSnapshot | null {
  try {
    const raw = fs.readFileSync(SNAPSHOT_PATH, 'utf-8')
    return JSON.parse(raw) as CounterInsightsSnapshot
  } catch {
    return null
  }
}

export function writeCounterInsights(snapshot: CounterInsightsSnapshot): void {
  const dir = path.dirname(SNAPSHOT_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2))
}
