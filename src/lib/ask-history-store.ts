import fs from 'fs'
import path from 'path'
import type { ChatMessage } from '@/types'
import { storePath } from './paths'

const STORE_PATH = storePath('ask-history.json')

export interface AskConversation {
  id: string
  title: string
  scope: string
  messages: ChatMessage[]
  created_at: string
  updated_at: string
}

interface Store {
  conversations: AskConversation[]
}

function read(): Store {
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf-8')
    const parsed = JSON.parse(raw) as Store
    return { conversations: parsed.conversations ?? [] }
  } catch {
    return { conversations: [] }
  }
}

function write(store: Store) {
  const dir = path.dirname(STORE_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2))
}

export function listConversations(): AskConversation[] {
  const store = read()
  return [...store.conversations].sort((a, b) =>
    b.updated_at.localeCompare(a.updated_at),
  )
}

export function getConversation(id: string): AskConversation | null {
  const store = read()
  return store.conversations.find(c => c.id === id) ?? null
}

function deriveTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find(m => m.role === 'user')
  const text = (firstUser?.content ?? '新對話').replace(/\s+/g, ' ').trim()
  return text.length > 40 ? text.slice(0, 40) + '…' : text
}

export function upsertConversation(payload: {
  id?: string
  scope: string
  messages: ChatMessage[]
}): AskConversation {
  const store = read()
  const now = new Date().toISOString()

  if (payload.id) {
    const existing = store.conversations.find(c => c.id === payload.id)
    if (existing) {
      existing.messages = payload.messages
      existing.scope = payload.scope
      existing.title = deriveTitle(payload.messages)
      existing.updated_at = now
      write(store)
      return existing
    }
  }

  const newConv: AskConversation = {
    id: payload.id ?? `conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: deriveTitle(payload.messages),
    scope: payload.scope,
    messages: payload.messages,
    created_at: now,
    updated_at: now,
  }
  store.conversations.unshift(newConv)
  write(store)
  return newConv
}

export function deleteConversation(id: string): boolean {
  const store = read()
  const idx = store.conversations.findIndex(c => c.id === id)
  if (idx < 0) return false
  store.conversations.splice(idx, 1)
  write(store)
  return true
}
