import fs from 'fs'
import path from 'path'
import type { SocialPost, Keyword } from '@/types'
import { storePath } from './paths'

const STORE_PATH = storePath('social-store.json')

const DEFAULT_KEYWORDS = [
  'LINE GO 共享汽車',
  'LINE GO 計程車',
  'LINE GO 共享機車',
  'LINE TAXI',
]

export type AnalysisCategory = 'rental' | 'taxi' | 'scooter' | 'overview'

export interface AnalysisCategoryResult {
  positive: { word: string; count: number }[]
  negative: { word: string; count: number }[]
  sentimentByPostId?: Record<number, 'positive' | 'neutral' | 'negative'>
}

export type AnalysisResult = Record<AnalysisCategory, AnalysisCategoryResult>

interface SocialStore {
  keywords: Keyword[]
  posts: SocialPost[]
  nextKeywordId: number
  nextPostId: number
  lastFetchedAt: string | null
  analysis?: AnalysisResult | null
  analyzedAt?: string | null
}

function seed(): SocialStore {
  const now = new Date().toISOString()
  return {
    keywords: DEFAULT_KEYWORDS.map((k, i) => ({
      id: i + 1,
      keyword: k,
      is_active: true,
      created_at: now,
    })),
    posts: [],
    nextKeywordId: DEFAULT_KEYWORDS.length + 1,
    nextPostId: 1,
    lastFetchedAt: null,
  }
}

function read(): SocialStore {
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return seed()
  }
}

function write(store: SocialStore) {
  const dir = path.dirname(STORE_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2))
}

export function getKeywords(): Keyword[] {
  return read().keywords
}

export function addKeyword(keyword: string): Keyword {
  const store = read()
  const trimmed = keyword.trim()
  const exists = store.keywords.find(k => k.keyword.toLowerCase() === trimmed.toLowerCase())
  if (exists) return exists
  const kw: Keyword = {
    id: store.nextKeywordId++,
    keyword: trimmed,
    is_active: true,
    created_at: new Date().toISOString(),
  }
  store.keywords.push(kw)
  write(store)
  return kw
}

export function removeKeyword(id: number) {
  const store = read()
  store.keywords = store.keywords.filter(k => k.id !== id)
  write(store)
}

export function toggleKeyword(id: number) {
  const store = read()
  const kw = store.keywords.find(k => k.id === id)
  if (kw) {
    kw.is_active = !kw.is_active
    write(store)
  }
}

export function getPosts(): SocialPost[] {
  return read().posts
}

export function getLastFetchedAt(): string | null {
  return read().lastFetchedAt
}

export function upsertPosts(newPosts: Omit<SocialPost, 'id'>[]): number {
  const store = read()
  const urlMap = new Map(store.posts.map(p => [p.url, p]))
  let inserted = 0

  for (const p of newPosts) {
    if (!p.url) continue
    const existing = urlMap.get(p.url)
    if (existing) {
      Object.assign(existing, p, { id: existing.id, sentiment: existing.sentiment })
    } else {
      store.posts.unshift({ ...p, id: store.nextPostId++ })
      inserted++
    }
  }

  store.lastFetchedAt = new Date().toISOString()
  write(store)
  return inserted
}

export function getAnalysis(): { analysis: AnalysisResult | null; analyzedAt: string | null } {
  const store = read()
  return { analysis: store.analysis ?? null, analyzedAt: store.analyzedAt ?? null }
}

export function saveAnalysis(analysis: AnalysisResult) {
  const store = read()
  store.analysis = analysis
  store.analyzedAt = new Date().toISOString()
  write(store)
}

export function assignSentiments(map: Record<number, 'positive' | 'neutral' | 'negative'>) {
  const store = read()
  for (const post of store.posts) {
    const sent = map[post.id]
    if (sent) post.sentiment = sent
  }
  write(store)
}

export function pruneOlderThan(days: number): number {
  const store = read()
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  const before = store.posts.length
  store.posts = store.posts.filter(p => {
    if (!p.published_at) return true
    const t = new Date(p.published_at).getTime()
    if (Number.isNaN(t)) return true
    return t >= cutoff
  })
  write(store)
  return before - store.posts.length
}
