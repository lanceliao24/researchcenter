import fs from 'fs'
import path from 'path'
import type { Persona, PersonaCategory } from '@/types'
import { storePath } from './paths'

const STORE_PATH = storePath('personas.json')

interface PersonaStore {
  personas: Persona[]
  nextId: number
}

function seed(): PersonaStore {
  return { personas: [], nextId: 1 }
}

export function inferCategoryFromFile(file: string): PersonaCategory {
  const lower = file.toLowerCase()
  if (lower.includes('rental') || lower.includes('rent') || lower.includes('租車') || lower.includes('共享汽車')) return 'rental'
  if (lower.includes('taxi') || lower.includes('計程')) return 'taxi'
  if (lower.includes('scooter') || lower.includes('share') || lower.includes('機車')) return 'scooter'
  return 'other'
}

// Legacy Chinese category values stored before the enum→key refactor.
const LEGACY_CATEGORY_MAP: Record<string, PersonaCategory> = {
  '租車': 'rental',
  '共享汽車': 'rental',
  '計程車': 'taxi',
  '共享機車': 'scooter',
  '其他': 'other',
}

function migrate(store: PersonaStore): { store: PersonaStore; changed: boolean } {
  let changed = false
  for (const p of store.personas) {
    if (!p.category) {
      p.category = inferCategoryFromFile(p.source?.file ?? '')
      changed = true
      continue
    }
    const mapped = LEGACY_CATEGORY_MAP[p.category as unknown as string]
    if (mapped && p.category !== mapped) {
      p.category = mapped
      changed = true
    }
  }
  return { store, changed }
}

function read(): PersonaStore {
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf-8')
    const parsed: PersonaStore = JSON.parse(raw)
    const { store, changed } = migrate(parsed)
    if (changed) write(store)
    return store
  } catch {
    return seed()
  }
}

function write(store: PersonaStore) {
  const dir = path.dirname(STORE_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2))
}

export function getPersonas(): Persona[] {
  return read().personas
}

export function getPersona(id: number): Persona | undefined {
  return read().personas.find(p => p.id === id)
}

export function addPersona(p: Omit<Persona, 'id' | 'created_at'>): Persona {
  const store = read()
  const persona: Persona = {
    ...p,
    id: store.nextId++,
    created_at: new Date().toISOString(),
  }
  store.personas.push(persona)
  write(store)
  return persona
}

export function removePersona(id: number) {
  const store = read()
  store.personas = store.personas.filter(p => p.id !== id)
  write(store)
}

export function findPersonaBySource(file: string, speaker: string): Persona | undefined {
  return read().personas.find(p => p.source.file === file && p.source.speaker === speaker)
}

export function upsertPersonaFromSource(
  data: Omit<Persona, 'id' | 'created_at'>
): Persona {
  const existing = findPersonaBySource(data.source.file, data.source.speaker)
  if (existing) {
    const store = read()
    const idx = store.personas.findIndex(p => p.id === existing.id)
    store.personas[idx] = { ...existing, ...data }
    write(store)
    return store.personas[idx]
  }
  return addPersona(data)
}
