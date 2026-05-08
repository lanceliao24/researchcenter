import fs from 'fs'
import path from 'path'
import { storePath } from './paths'

export type IssueKind = 'complaint' | 'suggestion' | 'mixed'
export type IssueTrend = 'rising' | 'falling' | 'stable' | 'single'

export interface IssueOccurrence {
  period: string         // 2025-Q1 / 2025-Q2 / 2026-03
  periodKind: 'quarter' | 'month'
  source: string         // file title or "monthly:<service>"
  rawLabel: string       // original theme title from source
  count?: number
  frequency?: string     // free-text like "約 30%"
  evidence?: string
}

export interface CanonicalIssue {
  title: string
  description: string
  kind: IssueKind
  occurrences: IssueOccurrence[]
  trend: IssueTrend
  rationale: string
}

export interface IssueTrendsSnapshot {
  generatedAt: string
  periods: string[]
  totalRawThemes: number
  issues: CanonicalIssue[]
  summary: string
}

const SNAPSHOT_PATH = storePath('issue-trends.json')

export function readIssueTrends(): IssueTrendsSnapshot | null {
  try {
    const raw = fs.readFileSync(SNAPSHOT_PATH, 'utf-8')
    return JSON.parse(raw) as IssueTrendsSnapshot
  } catch {
    return null
  }
}

export function writeIssueTrends(snapshot: IssueTrendsSnapshot): void {
  const dir = path.dirname(SNAPSHOT_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2))
}
