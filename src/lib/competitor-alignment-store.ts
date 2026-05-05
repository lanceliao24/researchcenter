import fs from 'fs'
import path from 'path'

export interface CompetitorCounts {
  positive: number
  negative: number
  neutral: number
  total: number
}

export interface CompetitorAlignmentSnapshot {
  generatedAt: string
  competitors: string[]
  countsByCompetitor: Record<string, CompetitorCounts>
  ourCounts: CompetitorCounts
  sharedIssues: { topic: string; ours: string; competitor: string }[]
  competitorOnly: { topic: string; competitor: string; evidence: string }[]
  ourOnly: { topic: string; evidence: string }[]
  summary: string
}

const STORE_PATH = path.join(process.cwd(), 'public', 'uploads', '_competitor_alignment.json')

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true })
}

export function readCompetitorAlignment(): CompetitorAlignmentSnapshot | null {
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8'))
  } catch {
    return null
  }
}

export function writeCompetitorAlignment(snap: CompetitorAlignmentSnapshot) {
  ensureDir(path.dirname(STORE_PATH))
  fs.writeFileSync(STORE_PATH, JSON.stringify(snap, null, 2))
}
