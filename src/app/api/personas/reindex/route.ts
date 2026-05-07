import { NextRequest, NextResponse } from 'next/server'
import { requireEditor } from '@/lib/auth'
import { logAudit } from '@/lib/audit-log'
import { reindexAllPersonas, reindexPersona } from '@/lib/rag/persona-indexer'
import { QuotaExceededError } from '@/lib/quota'

export async function POST(request: NextRequest) {
  const auth = await requireEditor(request)
  if (auth instanceof NextResponse) return auth

  const body = await request.json().catch(() => ({}))
  const personaId = typeof body.personaId === 'number' ? body.personaId : undefined

  try {
    if (personaId !== undefined) {
      const result = await reindexPersona(personaId)
      logAudit(auth, 'persona.reindex', `persona:${personaId}`, { indexed: result.indexed })
      return NextResponse.json({ result })
    }
    const results = await reindexAllPersonas()
    const totalIndexed = results.reduce((s, r) => s + r.indexed, 0)
    logAudit(auth, 'persona.reindex_all', null, {
      personas: results.length,
      totalIndexed,
    })
    return NextResponse.json({ results, totalIndexed })
  } catch (err) {
    if (err instanceof QuotaExceededError) {
      return NextResponse.json({ error: err.message }, { status: 429 })
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
