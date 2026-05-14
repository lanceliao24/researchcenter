import { NextRequest, NextResponse } from 'next/server'
import { isLocalMode } from '@/lib/local-mode'

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get('type')

  if (isLocalMode()) {
    const { getLocalDocuments } = await import('@/lib/local-store')
    const docs = getLocalDocuments(type || undefined)
    return NextResponse.json({ documents: docs })
  }

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  let query = supabase.from('documents').select('*').order('created_at', { ascending: false })
  if (type) query = query.eq('type', type)
  const { data } = await query
  return NextResponse.json({ documents: data || [] })
}

export async function PATCH(request: NextRequest) {
  if (!isLocalMode()) {
    return NextResponse.json({ error: 'Not implemented for remote mode' }, { status: 501 })
  }

  const body = await request.json().catch(() => ({}))
  const id = Number(body.id)
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  if (typeof body.category === 'string') patch.category = body.category
  if (Array.isArray(body.tags)) {
    patch.tags = body.tags.map((t: unknown) => String(t).trim()).filter(Boolean).slice(0, 8)
  }
  if (typeof body.summary === 'string') patch.summary = body.summary

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'no valid fields' }, { status: 400 })
  }

  const { updateLocalDocumentMetadata } = await import('@/lib/local-store')
  const updated = updateLocalDocumentMetadata(id, patch)
  if (!updated) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }
  return NextResponse.json({ ok: true, document: updated })
}

export async function DELETE(request: NextRequest) {
  const idParam = request.nextUrl.searchParams.get('id')
  const id = Number(idParam)
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }

  if (!isLocalMode()) {
    return NextResponse.json({ error: 'Not implemented for remote mode' }, { status: 501 })
  }

  const { removeLocalDocument } = await import('@/lib/local-store')
  const removed = removeLocalDocument(id)
  if (!removed) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  if (removed.type === 'survey') {
    const { clearSurveySummary } = await import('@/lib/survey-summary-store')
    clearSurveySummary(id)
  }

  return NextResponse.json({ ok: true, removed: { id: removed.id, title: removed.title } })
}
