import fs from 'fs'
import path from 'path'

export type InsightTone = 'positive' | 'warning' | 'info'

export interface DashboardInsight {
  tone: InsightTone
  title: string
  body: string
  source: 'survey' | 'social' | 'alert' | 'mixed'
}

export interface DashboardInsightsSnapshot {
  generatedAt: string
  insights: DashboardInsight[]
  context: Record<string, unknown>
}

const STORE_PATH = path.join(process.cwd(), 'public', 'uploads', '_dashboard_insights.json')

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true })
}

export function readInsights(): DashboardInsightsSnapshot | null {
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function writeInsights(snapshot: DashboardInsightsSnapshot) {
  ensureDir(path.dirname(STORE_PATH))
  fs.writeFileSync(STORE_PATH, JSON.stringify(snapshot, null, 2))
}
