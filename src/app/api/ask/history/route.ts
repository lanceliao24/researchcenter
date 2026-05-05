import { NextRequest, NextResponse } from 'next/server'
import {
  listConversations,
  upsertConversation,
} from '@/lib/ask-history-store'

export async function GET() {
  const items = listConversations().map(c => ({
    id: c.id,
    title: c.title,
    scope: c.scope,
    messageCount: c.messages.length,
    updated_at: c.updated_at,
  }))
  return NextResponse.json({ conversations: items })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  if (!Array.isArray(body.messages)) {
    return NextResponse.json({ error: 'messages required' }, { status: 400 })
  }
  const conv = upsertConversation({
    id: typeof body.id === 'string' ? body.id : undefined,
    scope: typeof body.scope === 'string' ? body.scope : 'all',
    messages: body.messages,
  })
  return NextResponse.json({ conversation: conv })
}
