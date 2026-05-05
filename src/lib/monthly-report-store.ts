import fs from 'fs'
import path from 'path'

export interface ReportFinding {
  title: string
  evidence: string
  recommendation: string
  tone: 'positive' | 'warning' | 'info'
  source: string
}

export interface MonthlyReportSnapshot {
  month: string
  generatedAt: string
  headline: string
  findings: ReportFinding[]
  overall: {
    responses: number
    serviceCount: number
    satisfied_pct: number
    nps: number
  }
}

const STORE_PATH = path.join(process.cwd(), 'public', 'uploads', '_monthly_report.json')

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true })
}

export function readReport(): MonthlyReportSnapshot | null {
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8'))
  } catch {
    return null
  }
}

export function writeReport(snap: MonthlyReportSnapshot) {
  ensureDir(path.dirname(STORE_PATH))
  fs.writeFileSync(STORE_PATH, JSON.stringify(snap, null, 2))
}
