import fs from 'fs'
import path from 'path'
import { storePath } from './paths'

const STORE_PATH = storePath('persona-group-chats.json')

export interface GroupMessage {
  type: 'user' | 'persona'
  personaId?: number
  personaName?: string
  content: string
  images?: string[]
  created_at: string
}

interface GroupChatStore {
  sessions: Record<string, GroupMessage[]>
}

export function sessionKey(personaIds: number[]): string {
  return [...personaIds].sort((a, b) => a - b).join(',')
}

function seed(): GroupChatStore {
  return { sessions: {} }
}

function read(): GroupChatStore {
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return seed()
  }
}

function write(store: GroupChatStore) {
  const dir = path.dirname(STORE_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2))
}

export function getGroupMessages(personaIds: number[]): GroupMessage[] {
  return read().sessions[sessionKey(personaIds)] ?? []
}

export function appendGroupMessages(personaIds: number[], messages: GroupMessage[]) {
  const store = read()
  const key = sessionKey(personaIds)
  const existing = store.sessions[key] ?? []
  store.sessions[key] = [...existing, ...messages]
  write(store)
  return store.sessions[key]
}

export function clearGroupMessages(personaIds: number[]) {
  const store = read()
  delete store.sessions[sessionKey(personaIds)]
  write(store)
}
