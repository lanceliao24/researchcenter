import fs from 'fs'
import path from 'path'

export interface AlignedTopic {
  topic: string
  surveyEvidence?: string
  socialEvidence?: string
  pct?: number
  count?: number
}

export interface OneSidedTopic {
  topic: string
  evidence: string
  count?: number
}

export interface TopicAlignmentSnapshot {
  month: string
  generatedAt: string
  surveyEvidenceCount: number
  socialEvidenceCount: number
  overlapping: AlignedTopic[]
  socialOnly: OneSidedTopic[]
  surveyOnly: OneSidedTopic[]
  summary: string
}

const STORE_PATH = path.join(process.cwd(), 'public', 'uploads', '_topic_alignment.json')

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true })
}

export function readAlignment(): TopicAlignmentSnapshot | null {
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8'))
  } catch {
    return null
  }
}

export function writeAlignment(snap: TopicAlignmentSnapshot) {
  ensureDir(path.dirname(STORE_PATH))
  fs.writeFileSync(STORE_PATH, JSON.stringify(snap, null, 2))
}
