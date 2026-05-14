import { NextResponse } from 'next/server'
import { getQuotaStatus } from '@/lib/quota'

export async function GET() {
  return NextResponse.json({
    gemini_chat: getQuotaStatus('gemini_chat'),
    gemini_chat_pro: getQuotaStatus('gemini_chat_pro'),
    gemini_embedding: getQuotaStatus('gemini_embedding'),
    firecrawl_search: getQuotaStatus('firecrawl_search'),
  })
}
