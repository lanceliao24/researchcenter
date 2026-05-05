import { NextRequest, NextResponse } from 'next/server'
import { deleteConversation, getConversation } from '@/lib/ask-history-store'

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  const conv = getConversation(id)
  if (!conv) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  }
  return NextResponse.json({ conversation: conv })
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  const ok = deleteConversation(id)
  if (!ok) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
