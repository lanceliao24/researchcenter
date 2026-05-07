import { NextRequest, NextResponse } from 'next/server'
import { getKeywords, addKeyword, removeKeyword, toggleKeyword } from '@/lib/social-store'
import { requireEditor } from '@/lib/auth'
import { logAudit } from '@/lib/audit-log'

export async function GET() {
  return NextResponse.json({ keywords: getKeywords() })
}

export async function POST(request: NextRequest) {
  const auth = await requireEditor(request)
  if (auth instanceof NextResponse) return auth
  const { keyword } = await request.json()
  if (!keyword || typeof keyword !== 'string' || !keyword.trim()) {
    return NextResponse.json({ error: 'Invalid keyword' }, { status: 400 })
  }
  const kw = addKeyword(keyword)
  logAudit(auth, 'keyword.add', `kw:${kw.id}`, { keyword: kw.keyword })
  return NextResponse.json({ keyword: kw })
}

export async function DELETE(request: NextRequest) {
  const auth = await requireEditor(request)
  if (auth instanceof NextResponse) return auth
  const { id } = await request.json()
  if (typeof id !== 'number') return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  removeKeyword(id)
  logAudit(auth, 'keyword.delete', `kw:${id}`)
  return NextResponse.json({ ok: true })
}

export async function PATCH(request: NextRequest) {
  const auth = await requireEditor(request)
  if (auth instanceof NextResponse) return auth
  const { id } = await request.json()
  if (typeof id !== 'number') return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  toggleKeyword(id)
  logAudit(auth, 'keyword.toggle', `kw:${id}`)
  return NextResponse.json({ ok: true })
}
