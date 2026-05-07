import { NextRequest, NextResponse } from 'next/server'
import { buildClearSessionCookieHeader } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const url = req.nextUrl.clone()
  url.pathname = '/login'
  url.search = ''
  const res = NextResponse.redirect(url, 303)
  res.headers.append(
    'Set-Cookie',
    buildClearSessionCookieHeader(req.nextUrl.protocol === 'https:'),
  )
  return res
}

export async function GET(req: NextRequest) {
  return POST(req)
}
