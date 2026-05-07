import fs from 'fs'
import path from 'path'
import { storePath } from './paths'
import type { Role } from './auth'

const QUOTA_PATH = storePath('quota.json')
const USER_QUOTA_PATH = storePath('user-quota.json')

const LIMITS = {
  gemini_chat: Number(process.env.QUOTA_GEMINI_CHAT_PER_DAY ?? 100),
  gemini_embedding: Number(process.env.QUOTA_GEMINI_EMBEDDING_PER_DAY ?? 2000),
  firecrawl_search: Number(process.env.QUOTA_FIRECRAWL_PER_DAY ?? 50),
} as const

const USER_LIMITS_BY_ROLE: Record<Role, Record<keyof typeof LIMITS, number>> = {
  editor: {
    gemini_chat: Number(process.env.QUOTA_USER_CHAT_EDITOR ?? 60),
    gemini_embedding: Number(process.env.QUOTA_USER_EMBEDDING_EDITOR ?? 1000),
    firecrawl_search: Number(process.env.QUOTA_USER_FIRECRAWL_EDITOR ?? 30),
  },
  viewer: {
    gemini_chat: Number(process.env.QUOTA_USER_CHAT_VIEWER ?? 30),
    gemini_embedding: Number(process.env.QUOTA_USER_EMBEDDING_VIEWER ?? 500),
    firecrawl_search: Number(process.env.QUOTA_USER_FIRECRAWL_VIEWER ?? 10),
  },
}

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

// ─── Per-user quota ───

interface UserQuotaData {
  date: string
  counts: Record<string, Record<string, number>>
}

function readUser(): UserQuotaData {
  try {
    const raw = fs.readFileSync(USER_QUOTA_PATH, 'utf-8')
    const data = JSON.parse(raw) as UserQuotaData
    if (data.date !== today()) return { date: today(), counts: {} }
    return data
  } catch {
    return { date: today(), counts: {} }
  }
}

function writeUser(data: UserQuotaData) {
  const dir = path.dirname(USER_QUOTA_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(USER_QUOTA_PATH, JSON.stringify(data, null, 2))
}

export function getUserQuotaStatus(email: string, role: Role, key: QuotaKey) {
  const data = readUser()
  const used = data.counts[email]?.[key] ?? 0
  const limit = USER_LIMITS_BY_ROLE[role][key]
  return { used, limit, remaining: Math.max(0, limit - used), date: data.date }
}

export function checkUserQuota(
  email: string,
  role: Role,
  key: QuotaKey,
): { ok: boolean; used: number; limit: number } {
  const { used, limit } = getUserQuotaStatus(email, role, key)
  return { ok: used < limit, used, limit }
}

export function incrementUserQuota(email: string, key: QuotaKey, n = 1) {
  const data = readUser()
  if (!data.counts[email]) data.counts[email] = {}
  data.counts[email][key] = (data.counts[email][key] ?? 0) + n
  writeUser(data)
  return data.counts[email][key]
}

export interface QuotaDeniedReason {
  scope: 'global' | 'user'
  key: QuotaKey
  used: number
  limit: number
}

export function checkBoth(
  session: { email: string; role: Role },
  key: QuotaKey,
): { ok: true } | { ok: false; reason: QuotaDeniedReason } {
  const g = checkQuota(key)
  if (!g.ok) return { ok: false, reason: { scope: 'global', key, used: g.used, limit: g.limit } }
  const u = checkUserQuota(session.email, session.role, key)
  if (!u.ok) return { ok: false, reason: { scope: 'user', key, used: u.used, limit: u.limit } }
  return { ok: true }
}

export function incrementBoth(
  session: { email: string; role: Role },
  key: QuotaKey,
  n = 1,
) {
  incrementQuota(key, n)
  incrementUserQuota(session.email, key, n)
}

export function quotaDeniedMessage(reason: QuotaDeniedReason): string {
  const scope = reason.scope === 'global' ? '全站' : '個人'
  const labels: Record<QuotaKey, string> = {
    gemini_chat: 'AI 問答',
    gemini_embedding: 'AI 向量索引',
    firecrawl_search: 'Firecrawl 搜尋',
  }
  return `今日${scope}${labels[reason.key]}額度已用完 (${reason.used}/${reason.limit})`
}
