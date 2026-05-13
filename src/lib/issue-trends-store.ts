import fs from 'fs'
import path from 'path'
import { storePath } from './paths'

export type IssueKind = 'complaint' | 'suggestion' | 'mixed'
export type IssueTrend = 'rising' | 'falling' | 'stable' | 'single'
export type IssueImpact = 'high' | 'medium' | 'low'
export type IssueConfidence = 'high' | 'medium' | 'low'
export type IssueAction = 'prioritize' | 'investigate' | 'monitor' | 'defer'

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
  // ── Decision layer (optional; older snapshots may not have these) ──
  impact?: IssueImpact
  confidence?: IssueConfidence
  recommended_action?: IssueAction
  action_rationale?: string
}

export interface ServiceTrends {
  service: string
  serviceLabel: string
  periods: string[]
  rawCount: number
  issues: CanonicalIssue[]
  summary: string
}

export interface IssueTrendsSnapshot {
  generatedAt: string
  totalRawThemes: number
  byService: ServiceTrends[]
}

// Re-exported for backward compatibility. Canonical definition lives in
// service-labels.ts (client-safe — no fs import).
export { SERVICE_LABELS, getServiceLabel } from './service-labels'

export function detectServiceFromTitle(title: string): string {
  const lower = title.toLowerCase()
  if (lower.includes('taxi') || /計程車/.test(title)) return 'taxi'
  if (lower.includes('rental') || /租車/.test(title)) return 'rental'
  if (lower.includes('scooter') || /機車|gogoro|wemo|goshare/i.test(title)) return 'scooter'
  if (lower.includes('chauffeur') || /包車/.test(title)) return 'chauffeured_car'
  if (lower.includes('shuttle') || /接送/.test(title)) return 'shuttle'
  if (lower.includes('charging') || /充電/.test(title)) return 'charging'
  return 'other'
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
