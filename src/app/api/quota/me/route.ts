import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { getQuotaStatus, getUserQuotaStatus, type QuotaKey } from '@/lib/quota'

const KEYS: QuotaKey[] = ['gemini_chat', 'gemini_chat_pro', 'gemini_embedding', 'firecrawl_search']

export async function GET(req: NextRequest) {
  const auth = await requireUser(req)
  if (auth instanceof NextResponse) return auth

  const quotas = KEYS.map(key => ({
    key,
    global: getQuotaStatus(key),
    personal: getUserQuotaStatus(auth.email, auth.role, key),
  }))

  return NextResponse.json({
    email: auth.email,
    role: auth.role,
    quotas,
  })
}
