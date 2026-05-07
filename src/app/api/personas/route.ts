import { NextRequest, NextResponse } from 'next/server'
import { getPersonas, removePersona } from '@/lib/persona-store'
import { requireEditor } from '@/lib/auth'

export async function GET() {
  return NextResponse.json({ personas: getPersonas() })
}

export async function DELETE(request: NextRequest) {
  const auth = await requireEditor(request)
  if (auth instanceof NextResponse) return auth
  const { id } = await request.json().catch(() => ({ id: null }))
  if (typeof id !== 'number') {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }
  removePersona(id)
  return NextResponse.json({ ok: true })
}
