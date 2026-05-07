import { NextRequest, NextResponse } from 'next/server'
import { getKeywords, addKeyword, removeKeyword, toggleKeyword } from '@/lib/social-store'
import { requireEditor } from '@/lib/auth'

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
  return NextResponse.json({ keyword: kw })
}

export async function DELETE(request: NextRequest) {
  const auth = await requireEditor(request)
  if (auth instanceof NextResponse) return auth
  const { id } = await request.json()
  if (typeof id !== 'number') return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  removeKeyword(id)
  return NextResponse.json({ ok: true })
}

export async function PATCH(request: NextRequest) {
  const auth = await requireEditor(request)
  if (auth instanceof NextResponse) return auth
  const { id } = await request.json()
  if (typeof id !== 'number') return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  toggleKeyword(id)
  return NextResponse.json({ ok: true })
}
