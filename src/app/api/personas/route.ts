import { NextRequest, NextResponse } from 'next/server'
import { getPersonas, removePersona } from '@/lib/persona-store'

export async function GET() {
  return NextResponse.json({ personas: getPersonas() })
}

export async function DELETE(request: NextRequest) {
  const { id } = await request.json().catch(() => ({ id: null }))
  if (typeof id !== 'number') {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }
  removePersona(id)
  try {
    const { deletePersonaQuotes } = await import('@/lib/rag/persona-indexer')
    deletePersonaQuotes(id)
  } catch (err) {
    console.error(`[persona-index] delete ${id} failed:`, err)
  }
  return NextResponse.json({ ok: true })
}
