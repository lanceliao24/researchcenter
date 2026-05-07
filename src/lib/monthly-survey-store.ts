import fs from 'fs'
import path from 'path'
import type { SurveyMonthlyMetrics, SurveyMonthlyRawRow, SurveyTheme } from '@/types'
import { storePath, filesPath } from './paths'

const METRICS_PATH = storePath('monthly-survey-metrics.json')
const RAW_DIR = filesPath('survey-monthly')

interface MetricsStore {
  metrics: SurveyMonthlyMetrics[]
}

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true })
}

function readMetricsStore(): MetricsStore {
  try {
    const raw = fs.readFileSync(METRICS_PATH, 'utf-8')
    const parsed = JSON.parse(raw)
    if (parsed && Array.isArray(parsed.metrics)) return parsed
    return { metrics: [] }
  } catch {
    return { metrics: [] }
  }
}

function writeMetricsStore(store: MetricsStore) {
  ensureDir(path.dirname(METRICS_PATH))
  fs.writeFileSync(METRICS_PATH, JSON.stringify(store, null, 2))
}

function rawPath(month: string) {
  return path.join(RAW_DIR, `${month}.json`)
}

export function listMonths(): string[] {
  const months = new Set<string>()
  for (const m of readMetricsStore().metrics) months.add(m.month)
  return Array.from(months).sort().reverse()
}

export function listMetricsByMonth(month: string): SurveyMonthlyMetrics[] {
  return readMetricsStore().metrics
    .filter(m => m.month === month)
    .sort((a, b) => b.responses - a.responses)
}

export function getMetrics(month: string, service: string): SurveyMonthlyMetrics | undefined {
  return readMetricsStore().metrics.find(m => m.month === month && m.service === service)
}

export function upsertMetrics(metrics: SurveyMonthlyMetrics[]) {
  if (metrics.length === 0) return
  const store = readMetricsStore()
  for (const m of metrics) {
    const idx = store.metrics.findIndex(x => x.month === m.month && x.service === m.service)
    if (idx >= 0) {
      const prev = store.metrics[idx]
      store.metrics[idx] = {
        ...m,
        themes: prev.themes,
        themes_updated_at: prev.themes_updated_at,
      }
    } else {
      store.metrics.push(m)
    }
  }
  writeMetricsStore(store)
}

export function updateThemes(
  month: string,
  service: string,
  themes: { suggestion?: SurveyTheme[]; complaint?: SurveyTheme[] },
) {
  const store = readMetricsStore()
  const idx = store.metrics.findIndex(x => x.month === month && x.service === service)
  if (idx < 0) return
  store.metrics[idx] = {
    ...store.metrics[idx],
    themes,
    themes_updated_at: new Date().toISOString(),
  }
  writeMetricsStore(store)
}

export interface MonthlyOverview {
  month: string
  responses: number
  serviceCount: number
  satisfied_pct: number
  satisfaction_avg: number
  nps: number
  promoters: number
  detractors: number
}

export function getMonthlyOverview(month?: string): MonthlyOverview | null {
  const target = month ?? listMonths()[0]
  if (!target) return null
  const metrics = listMetricsByMonth(target)
  if (metrics.length === 0) return null
  let responses = 0
  let satFour = 0
  let satSum = 0
  let promoters = 0
  let detractors = 0
  for (const m of metrics) {
    responses += m.responses
    satFour += (m.satisfaction_dist['4'] ?? 0) + (m.satisfaction_dist['5'] ?? 0)
    satSum += m.satisfaction_avg * m.responses
    promoters += m.promoters
    detractors += m.detractors
  }
  if (responses === 0) return null
  return {
    month: target,
    responses,
    serviceCount: metrics.length,
    satisfied_pct: (satFour / responses) * 100,
    satisfaction_avg: satSum / responses,
    nps: ((promoters - detractors) / responses) * 100,
    promoters,
    detractors,
  }
}

export function loadMonthRawRows(month: string): SurveyMonthlyRawRow[] {
  const p = rawPath(month)
  if (!fs.existsSync(p)) return []
  try {
    const raw = fs.readFileSync(p, 'utf-8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function upsertMonthRawRows(month: string, rows: SurveyMonthlyRawRow[]): SurveyMonthlyRawRow[] {
  ensureDir(RAW_DIR)
  const existing = loadMonthRawRows(month)
  const map = new Map<number, SurveyMonthlyRawRow>()
  for (const r of existing) map.set(r.id, r)
  for (const r of rows) map.set(r.id, r)
  const merged = Array.from(map.values())
  fs.writeFileSync(rawPath(month), JSON.stringify(merged))
  return merged
}
