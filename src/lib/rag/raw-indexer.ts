import fs from 'fs'
import Papa from 'papaparse'
import { getLocalDocuments } from '@/lib/local-store'
import { resolveFileApiUrl } from '@/lib/paths'
import { getSurveySummary } from '@/lib/survey-summary-store'
import { chunkText } from './chunker'
import { upsertChunks, deleteBySource, type VectorRecordInput } from './local-semantic-retriever'
import type { Document, PersonaCategory } from '@/types'

function inferCategory(title: string, filename?: string): PersonaCategory {
  const text = (title + ' ' + (filename ?? '')).toLowerCase()
  if (/rent|租車/i.test(text)) return '租車'
  if (/taxi|cab|計程車|叫車/i.test(text)) return '計程車'
  if (/scooter|gogoro|wemo|goshare|moto|機車/i.test(text)) return '共享機車'
  return '其他'
}

function getDocumentCategory(doc: Document): PersonaCategory {
  const meta = doc.metadata as Record<string, unknown> | null
  const explicit = meta?.category as PersonaCategory | undefined
  if (explicit) return explicit
  return inferCategory(doc.title, doc.file_path ?? undefined)
}

function readDocumentContent(doc: Document): string | null {
  const meta = doc.metadata as Record<string, unknown> | null
  const textPath = meta?.textPath as string | undefined
  const filePath = textPath || doc.file_path
  if (!filePath) return null
  const fullPath = resolveFileApiUrl(filePath)
  if (!fullPath || !fs.existsSync(fullPath)) return null
  return fs.readFileSync(fullPath, 'utf-8')
}

export interface IndexResult {
  documentId: number
  source_type: string
  indexed: number
  skipped?: string
}

export interface IndexOptions {
  maxRecords?: number
}

export async function indexSurveyDocument(doc: Document, opts: IndexOptions = {}): Promise<IndexResult> {
  const content = readDocumentContent(doc)
  if (!content) return { documentId: doc.id, source_type: 'survey_open', indexed: 0, skipped: 'file not found' }

  const summary = getSurveySummary(doc.id)
  const declared: string[] = summary?.openEndedColumns ?? []

  const parsed = Papa.parse(content, { header: true, skipEmptyLines: true })
  const rows = parsed.data as Record<string, unknown>[]
  const headers = parsed.meta.fields || []

  const candidates = declared.length > 0
    ? declared.filter(c => headers.includes(c))
    : headers
  const targetColumns = candidates.filter(h => {
    if (/^(hash|ip|id|uuid|timestamp|建立時間|序號|流水號)/i.test(h)) return false
    const sample = rows.slice(0, Math.min(200, rows.length))
    const nonEmpty = sample
      .map(r => String(r[h] || '').trim())
      .filter(v => v.length > 0)
    if (nonEmpty.length === 0) return false
    const fillRate = nonEmpty.length / sample.length
    const avgLen = nonEmpty.reduce((s, v) => s + v.length, 0) / nonEmpty.length
    return avgLen >= 10 && fillRate >= 0.03
  })

  if (targetColumns.length === 0) {
    return { documentId: doc.id, source_type: 'survey_open', indexed: 0, skipped: 'no open-ended columns' }
  }

  const category = getDocumentCategory(doc)
  const inputs: VectorRecordInput[] = []
  let recordIdx = 0

  for (let r = 0; r < rows.length; r++) {
    if (opts.maxRecords !== undefined && inputs.length >= opts.maxRecords) break
    const row = rows[r]
    for (let c = 0; c < targetColumns.length; c++) {
      if (opts.maxRecords !== undefined && inputs.length >= opts.maxRecords) break
      const col = targetColumns[c]
      const value = String(row[col] || '').trim()
      if (value.length < 5) continue
      inputs.push({
        source_type: 'survey_open',
        source_id: doc.id,
        chunk_index: recordIdx++,
        text: `題目：${col}\n回答：${value}`,
        metadata: {
          document_title: doc.title,
          category,
          quote_source: col,
          row_index: r,
          column_name: col,
          original_value: value,
        },
      })
    }
  }

  deleteBySource('survey_open', doc.id)
  const indexed = inputs.length > 0 ? await upsertChunks(inputs) : 0
  return { documentId: doc.id, source_type: 'survey_open', indexed }
}

export async function indexTextDocument(doc: Document, opts: IndexOptions = {}): Promise<IndexResult> {
  const content = readDocumentContent(doc)
  if (!content) return { documentId: doc.id, source_type: doc.type, indexed: 0, skipped: 'file not found' }

  const sourceType = doc.type === 'transcript' ? 'transcript' : 'report'
  const allChunks = chunkText(content, 500, 100)
  if (allChunks.length === 0) {
    return { documentId: doc.id, source_type: sourceType, indexed: 0, skipped: 'empty content' }
  }

  const chunks = opts.maxRecords !== undefined ? allChunks.slice(0, opts.maxRecords) : allChunks
  const category = getDocumentCategory(doc)
  const inputs: VectorRecordInput[] = chunks.map(chunk => ({
    source_type: sourceType,
    source_id: doc.id,
    chunk_index: chunk.index,
    text: chunk.text,
    metadata: {
      document_title: doc.title,
      category,
    },
  }))

  deleteBySource(sourceType, doc.id)
  const indexed = await upsertChunks(inputs)
  return { documentId: doc.id, source_type: sourceType, indexed }
}

export async function indexDocument(doc: Document, opts: IndexOptions = {}): Promise<IndexResult> {
  if (doc.type === 'survey') return indexSurveyDocument(doc, opts)
  if (doc.type === 'transcript' || doc.type === 'report') return indexTextDocument(doc, opts)
  return { documentId: doc.id, source_type: doc.type, indexed: 0, skipped: `unsupported type ${doc.type}` }
}

export async function indexThemesForDocument(doc: Document): Promise<IndexResult> {
  const summary = getSurveySummary(doc.id)
  if (!summary || summary.themes.length === 0) {
    return { documentId: doc.id, source_type: 'theme', indexed: 0, skipped: 'no themes' }
  }
  const category = getDocumentCategory(doc)
  const inputs: VectorRecordInput[] = summary.themes.map((theme, i) => ({
    source_type: 'theme',
    source_id: doc.id,
    chunk_index: i,
    text: `${theme.title}：${theme.description}`,
    metadata: {
      document_title: doc.title,
      category,
      quote_source: theme.quote_source,
      frequency_estimate: theme.frequency_estimate,
      original_quote: theme.quote,
    },
  }))
  deleteBySource('theme', doc.id)
  const indexed = await upsertChunks(inputs)
  return { documentId: doc.id, source_type: 'theme', indexed }
}

export async function indexAll(opts: IndexOptions = {}): Promise<{
  results: IndexResult[]
  totalIndexed: number
}> {
  const docs = getLocalDocuments()
  const results: IndexResult[] = []
  for (const doc of docs) {
    results.push(await indexDocument(doc, opts))
    if (doc.type === 'survey') {
      results.push(await indexThemesForDocument(doc))
    }
  }
  const totalIndexed = results.reduce((s, r) => s + r.indexed, 0)
  return { results, totalIndexed }
}
