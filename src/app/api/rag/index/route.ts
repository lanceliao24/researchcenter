import { NextRequest, NextResponse } from 'next/server'
import { getLocalDocuments } from '@/lib/local-store'
import {
  indexDocument,
  indexThemesForDocument,
  indexAll,
} from '@/lib/rag/raw-indexer'
import { deleteAll, getIndexStats } from '@/lib/rag/local-semantic-retriever'
import { getQuotaStatus, QuotaExceededError } from '@/lib/quota'
import { requireEditor } from '@/lib/auth'
import { logAudit } from '@/lib/audit-log'

export async function GET() {
  const stats = getIndexStats()
  return NextResponse.json({
    ...stats,
    quota: getQuotaStatus('gemini_embedding'),
  })
}

export async function POST(request: NextRequest) {
  const auth = await requireEditor(request)
  if (auth instanceof NextResponse) return auth
  const body = await request.json().catch(() => ({}))
  const { document_id, all, themes_only, reset, max_records } = body as {
    document_id?: number
    all?: boolean
    themes_only?: boolean
    reset?: boolean
    max_records?: number
  }

  if (reset) {
    deleteAll()
    logAudit(auth, 'rag.index_reset', null)
    return NextResponse.json({ reset: true, stats: getIndexStats() })
  }

  const indexOpts = typeof max_records === 'number' ? { maxRecords: max_records } : {}

  try {
    if (all) {
      const result = await indexAll(indexOpts)
      logAudit(auth, 'rag.index_all', null, { totalIndexed: result.totalIndexed })
      return NextResponse.json({
        ...result,
        stats: getIndexStats(),
        quota: getQuotaStatus('gemini_embedding'),
      })
    }

    if (typeof document_id !== 'number') {
      return NextResponse.json(
        { error: 'document_id (number) required, or set all=true' },
        { status: 400 },
      )
    }

    const doc = getLocalDocuments().find(d => d.id === document_id)
    if (!doc) {
      return NextResponse.json({ error: `document ${document_id} not found` }, { status: 404 })
    }

    const results = []
    if (!themes_only) {
      results.push(await indexDocument(doc, indexOpts))
    }
    if (doc.type === 'survey') {
      results.push(await indexThemesForDocument(doc))
    }

    const totalIndexed = results.reduce((s, r) => s + r.indexed, 0)
    logAudit(auth, 'rag.index', `doc:${document_id}`, { totalIndexed })
    return NextResponse.json({
      results,
      totalIndexed,
      stats: getIndexStats(),
      quota: getQuotaStatus('gemini_embedding'),
    })
  } catch (err) {
    if (err instanceof QuotaExceededError) {
      return NextResponse.json(
        {
          error: err.message,
          quota: getQuotaStatus('gemini_embedding'),
        },
        { status: 429 },
      )
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
