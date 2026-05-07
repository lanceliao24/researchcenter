import { NextRequest, NextResponse } from 'next/server'
import { requireEditor } from '@/lib/auth'
import { readAuditLog } from '@/lib/audit-log'

export async function GET(request: NextRequest) {
  const auth = await requireEditor(request)
  if (auth instanceof NextResponse) return auth

  const params = request.nextUrl.searchParams
  const limitRaw = Number(params.get('limit') ?? '200')
  const limit = Math.min(Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 200), 1000)
  const email = params.get('email') || undefined
  const action = params.get('action') || undefined
  const sinceParam = params.get('since')
  const since = sinceParam ? new Date(sinceParam) : undefined

  const events = readAuditLog({ email, action, since, limit })
  return NextResponse.json({ events, count: events.length })
}
