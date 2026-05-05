import fs from 'fs'
import path from 'path'
import type { PersonaChatMessage } from '@/types'

const STORE_PATH = path.join(process.cwd(), 'public', 'uploads', '_persona_chats.json')

interface ChatStore {
  conversations: Record<number, PersonaChatMessage[]>
  nextMessageId: number
}

function seed(): ChatStore {
  return { conversations: {}, nextMessageId: 1 }
}

function read(): ChatStore {
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return seed()
  }
}

function write(store: ChatStore) {
  const dir = path.dirname(STORE_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2))
}

export function getMessages(personaId: number): PersonaChatMessage[] {
  return read().conversations[personaId] ?? []
}

export function appendMessage(
  personaId: number,
  role: 'user' | 'assistant',
  content: string,
  images?: string[]
): PersonaChatMessage {
  const store = read()
  const msg: PersonaChatMessage = {
    id: store.nextMessageId++,
    role,
    content,
    created_at: new Date().toISOString(),
  }
  if (images && images.length > 0) msg.images = images
  if (!store.conversations[personaId]) store.conversations[personaId] = []
  store.conversations[personaId].push(msg)
  write(store)
  return msg
}

export function clearMessages(personaId: number) {
  const store = read()
  delete store.conversations[personaId]
  write(store)
}

export function removeMessage(personaId: number, messageId: number) {
  const store = read()
  const conv = store.conversations[personaId]
  if (!conv) return
  store.conversations[personaId] = conv.filter(m => m.id !== messageId)
  write(store)
}
