import fs from 'fs'
import path from 'path'
import type { PersonaSurveyFillRun } from '@/types'

const STORE_PATH = path.join(process.cwd(), 'public', 'uploads', '_persona_survey_fills.json')

interface FillStore {
  runs: PersonaSurveyFillRun[]
  nextId: number
}

function seed(): FillStore {
  return { runs: [], nextId: 1 }
}

function read(): FillStore {
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return seed()
  }
}

function write(store: FillStore) {
  const dir = path.dirname(STORE_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2))
}

export function listRuns(surveyId?: number): PersonaSurveyFillRun[] {
  const runs = read().runs
  return surveyId == null ? runs : runs.filter(r => r.surveyId === surveyId)
}

export function getRun(id: number): PersonaSurveyFillRun | undefined {
  return read().runs.find(r => r.id === id)
}

export function saveRun(run: Omit<PersonaSurveyFillRun, 'id' | 'createdAt'>): PersonaSurveyFillRun {
  const store = read()
  const full: PersonaSurveyFillRun = {
    ...run,
    id: store.nextId++,
    createdAt: new Date().toISOString(),
  }
  store.runs.unshift(full)
  write(store)
  return full
}

export function deleteRun(id: number) {
  const store = read()
  store.runs = store.runs.filter(r => r.id !== id)
  write(store)
}
