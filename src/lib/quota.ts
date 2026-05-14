import fs from 'fs'
import path from 'path'
import { storePath } from './paths'

const QUOTA_PATH = storePath('quota.json')

const LIMITS = {
  gemini_chat: Number(process.env.QUOTA_GEMINI_CHAT_PER_DAY ?? 100),
  gemini_chat_pro: Number(process.env.QUOTA_GEMINI_CHAT_PRO_PER_DAY ?? 50),
  gemini_embedding: Number(process.env.QUOTA_GEMINI_EMBEDDING_PER_DAY ?? 2000),
  firecrawl_search: Number(process.env.QUOTA_FIRECRAWL_PER_DAY ?? 50),
} as const

export type QuotaKey = keyof typeof LIMITS

interface QuotaData {
  date: string
  counts: Record<string, number>
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function read(): QuotaData {
  try {
    const raw = fs.readFileSync(QUOTA_PATH, 'utf-8')
    const data = JSON.parse(raw) as QuotaData
    if (data.date !== today()) return { date: today(), counts: {} }
    return data
  } catch {
    return { date: today(), counts: {} }
  }
}

function write(data: QuotaData) {
  const dir = path.dirname(QUOTA_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(QUOTA_PATH, JSON.stringify(data, null, 2))
}

export function getQuotaStatus(key: QuotaKey) {
  const data = read()
  const used = data.counts[key] ?? 0
  const limit = LIMITS[key]
  return { used, limit, remaining: Math.max(0, limit - used), date: data.date }
}

export function checkQuota(key: QuotaKey): { ok: boolean; used: number; limit: number } {
  const { used, limit } = getQuotaStatus(key)
  return { ok: used < limit, used, limit }
}

export function incrementQuota(key: QuotaKey, n = 1) {
  const data = read()
  data.counts[key] = (data.counts[key] ?? 0) + n
  write(data)
  return data.counts[key]
}

export class QuotaExceededError extends Error {
  constructor(public key: QuotaKey, public used: number, public limit: number) {
    super(`Daily quota exceeded for ${key}: ${used}/${limit}`)
    this.name = 'QuotaExceededError'
  }
}

const LABELS: Record<QuotaKey, string> = {
  gemini_chat: 'AI 問答',
  gemini_chat_pro: 'AI 深度分析（Pro）',
  gemini_embedding: 'AI 向量索引',
  firecrawl_search: 'Firecrawl 搜尋',
}

export function quotaDeniedMessage(key: QuotaKey, used: number, limit: number): string {
  return `今日${LABELS[key]}額度已用完 (${used}/${limit})`
}
