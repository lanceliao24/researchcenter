import fs from 'fs'
import path from 'path'
import { generateEmbedding, generateEmbeddings } from '@/lib/gemini'
import { checkQuota, incrementQuota, QuotaExceededError } from '@/lib/quota'
import { storePath } from '@/lib/paths'
import type { PersonaCategory } from '@/types'

const INDEX_PATH = storePath('vector-index.ndjson')

export type VectorSourceType =
  | 'survey_open'
  | 'transcript'
  | 'report'
  | 'insight'
  | 'theme'
  | 'persona_quote'

export interface VectorMetadata {
  document_title?: string
  category?: PersonaCategory
  jtbd_stage?: string
  quote_source?: string
  speaker?: string
  [k: string]: unknown
}

export interface VectorRecord {
  id: string
  source_type: VectorSourceType
  source_id: number
  chunk_index: number
  text: string
  embedding: number[]
  metadata: VectorMetadata
  created_at: string
}

export type VectorRecordInput = Omit<VectorRecord, 'id' | 'embedding' | 'created_at'>

export interface SemanticSearchFilter {
  source_type?: VectorSourceType | VectorSourceType[]
  category?: PersonaCategory | PersonaCategory[]
  jtbd_stage?: string
  document_id?: number | number[]
}

export interface SemanticSearchOptions {
  topK?: number
  filter?: SemanticSearchFilter
}

export interface ScoredVectorRecord extends VectorRecord {
  score: number
}

let cache: VectorRecord[] | null = null

function makeId(source_type: VectorSourceType, source_id: number, chunk_index: number): string {
  return `${source_type}:${source_id}:${chunk_index}`
}

function l2Normalize(v: number[]): number[] {
  let sumSq = 0
  for (const x of v) sumSq += x * x
  const norm = Math.sqrt(sumSq)
  if (norm === 0) return v.slice()
  const out = new Array<number>(v.length)
  for (let i = 0; i < v.length; i++) out[i] = v[i] / norm
  return out
}

function dot(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

function loadAll(): VectorRecord[] {
  if (cache) return cache
  if (!fs.existsSync(INDEX_PATH)) {
    cache = []
    return cache
  }
  const raw = fs.readFileSync(INDEX_PATH, 'utf-8')
  const records: VectorRecord[] = []
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      records.push(JSON.parse(trimmed) as VectorRecord)
    } catch {
      // skip malformed line
    }
  }
  cache = records
  return cache
}

function writeAll(records: VectorRecord[]) {
  const dir = path.dirname(INDEX_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const lines = records.map(r => JSON.stringify(r))
  fs.writeFileSync(INDEX_PATH, lines.join('\n') + (lines.length > 0 ? '\n' : ''))
  cache = records
}

function invalidate() {
  cache = null
}

export async function upsertChunks(inputs: VectorRecordInput[]): Promise<number> {
  if (inputs.length === 0) return 0

  const quota = checkQuota('gemini_embedding')
  if (!quota.ok || quota.limit - quota.used < inputs.length) {
    throw new QuotaExceededError('gemini_embedding', quota.used, quota.limit)
  }

  const newRecords: VectorRecord[] = []
  const batchSize = 10
  const now = new Date().toISOString()

  for (let i = 0; i < inputs.length; i += batchSize) {
    const batch = inputs.slice(i, i + batchSize)
    const texts = batch.map(b => b.text)
    const embeddings = await generateEmbeddings(texts)
    for (let j = 0; j < batch.length; j++) {
      incrementQuota('gemini_embedding')
      const input = batch[j]
      const emb = l2Normalize(embeddings[j])
      newRecords.push({
        id: makeId(input.source_type, input.source_id, input.chunk_index),
        source_type: input.source_type,
        source_id: input.source_id,
        chunk_index: input.chunk_index,
        text: input.text,
        embedding: emb,
        metadata: input.metadata,
        created_at: now,
      })
    }
  }

  const existing = loadAll()
  const byId = new Map<string, VectorRecord>()
  for (const r of existing) byId.set(r.id, r)
  for (const r of newRecords) byId.set(r.id, r)
  writeAll([...byId.values()])

  return newRecords.length
}

export function deleteBySource(source_type: VectorSourceType, source_id: number): number {
  const existing = loadAll()
  const kept = existing.filter(r => !(r.source_type === source_type && r.source_id === source_id))
  const removed = existing.length - kept.length
  if (removed > 0) writeAll(kept)
  return removed
}

export function deleteAll(): void {
  if (fs.existsSync(INDEX_PATH)) fs.unlinkSync(INDEX_PATH)
  invalidate()
}

function matchesFilter(record: VectorRecord, filter?: SemanticSearchFilter): boolean {
  if (!filter) return true
  if (filter.source_type) {
    const allowed = Array.isArray(filter.source_type) ? filter.source_type : [filter.source_type]
    if (!allowed.includes(record.source_type)) return false
  }
  if (filter.category) {
    const allowed = Array.isArray(filter.category) ? filter.category : [filter.category]
    if (!record.metadata.category || !allowed.includes(record.metadata.category)) return false
  }
  if (filter.jtbd_stage) {
    if (record.metadata.jtbd_stage !== filter.jtbd_stage) return false
  }
  if (filter.document_id !== undefined) {
    const allowed = Array.isArray(filter.document_id) ? filter.document_id : [filter.document_id]
    const docId = (record.metadata.document_id as number | undefined) ?? record.source_id
    if (!allowed.includes(docId)) return false
  }
  return true
}

export async function semanticSearch(
  query: string,
  opts: SemanticSearchOptions = {},
): Promise<ScoredVectorRecord[]> {
  const topK = opts.topK ?? 8

  const records = loadAll()
  if (records.length === 0) return []

  const quota = checkQuota('gemini_embedding')
  if (!quota.ok) throw new QuotaExceededError('gemini_embedding', quota.used, quota.limit)

  const queryEmbeddingRaw = await generateEmbedding(query)
  incrementQuota('gemini_embedding')
  const queryEmbedding = l2Normalize(queryEmbeddingRaw)

  const scored: ScoredVectorRecord[] = []
  for (const r of records) {
    if (!matchesFilter(r, opts.filter)) continue
    const score = dot(queryEmbedding, r.embedding)
    scored.push({ ...r, score })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, topK)
}

export function getIndexStats(): {
  totalRecords: number
  bySourceType: Record<string, number>
  embeddingDim: number | null
} {
  const records = loadAll()
  const bySourceType: Record<string, number> = {}
  for (const r of records) {
    bySourceType[r.source_type] = (bySourceType[r.source_type] ?? 0) + 1
  }
  return {
    totalRecords: records.length,
    bySourceType,
    embeddingDim: records[0]?.embedding.length ?? null,
  }
}
