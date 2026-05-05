import fs from 'fs'
import path from 'path'

const STORE_PATH = path.join(process.cwd(), 'public', 'uploads', '_survey_summaries.json')

export interface SurveySummaryTheme {
  title: string
  description: string
  frequency_estimate: string
  quote: string
  quote_source: string
}

export interface SurveySummary {
  documentId: number
  themes: SurveySummaryTheme[]
  totalRows: number
  sampledRows: number
  openEndedColumns: string[]
  generatedAt: string
}

interface SummaryStore {
  summaries: Record<number, SurveySummary>
}

function seed(): SummaryStore {
  return { summaries: {} }
}

function read(): SummaryStore {
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return seed()
  }
}

function write(store: SummaryStore) {
  const dir = path.dirname(STORE_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2))
}

export function getSurveySummary(documentId: number): SurveySummary | undefined {
  return read().summaries[documentId]
}

export function saveSurveySummary(summary: SurveySummary) {
  const store = read()
  store.summaries[summary.documentId] = summary
  write(store)
  return summary
}

export function clearSurveySummary(documentId: number) {
  const store = read()
  delete store.summaries[documentId]
  write(store)
}
