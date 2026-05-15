// Persona simulator RAG — backfill endpoint
//
// 訪談原文按 persona 切 chunks → vector index（source_type='persona_quote', source_id=personaId）
// 用途：1:1 chat / group-chat / ab-test 依問題 retrieve top-3（cosine ≥ 0.3）注入 system prompt
// 取代之前的靜態 transcript_digest（已從 system prompt 移除，避免 token 浪費 + 提升相關性）

import { NextRequest, NextResponse } from 'next/server'
import { reindexAllPersonas, reindexPersona } from '@/lib/rag/persona-indexer'
import { QuotaExceededError } from '@/lib/quota'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const personaId = typeof body.personaId === 'number' ? body.personaId : undefined

  try {
    if (personaId !== undefined) {
      const result = await reindexPersona(personaId)
      return NextResponse.json({ result })
    }
    const results = await reindexAllPersonas()
    const totalIndexed = results.reduce((s, r) => s + r.indexed, 0)
    return NextResponse.json({ results, totalIndexed })
  } catch (err) {
    if (err instanceof QuotaExceededError) {
      return NextResponse.json({ error: err.message }, { status: 429 })
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
