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
