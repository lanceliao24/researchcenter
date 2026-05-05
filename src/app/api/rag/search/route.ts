import { NextRequest, NextResponse } from 'next/server'
import {
  semanticSearch,
  type SemanticSearchFilter,
} from '@/lib/rag/local-semantic-retriever'
import { getQuotaStatus, QuotaExceededError } from '@/lib/quota'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const { query, topK, filter } = body as {
    query?: string
    topK?: number
    filter?: SemanticSearchFilter
  }

  if (!query || typeof query !== 'string' || !query.trim()) {
    return NextResponse.json({ error: 'query (string) required' }, { status: 400 })
  }

  try {
    const results = await semanticSearch(query.trim(), { topK, filter })
    const slim = results.map(({ embedding: _embedding, ...rest }) => rest)
    return NextResponse.json({
      query,
      results: slim,
      count: slim.length,
      quota: getQuotaStatus('gemini_embedding'),
    })
  } catch (err) {
    if (err instanceof QuotaExceededError) {
      return NextResponse.json(
        { error: err.message, quota: getQuotaStatus('gemini_embedding') },
        { status: 429 },
      )
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
