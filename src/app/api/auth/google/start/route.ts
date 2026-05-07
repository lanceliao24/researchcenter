import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { STATE_COOKIE, buildGoogleAuthUrl } from '@/lib/auth'

function getCallbackUrl(req: NextRequest): string {
  const base = process.env.AUTH_BASE_URL || req.nextUrl.origin
  return `${base}/api/auth/google/callback`
}

function loginErrorRedirect(req: NextRequest, message: string): NextResponse {
  const url = req.nextUrl.clone()
  url.pathname = '/login'
  url.search = `?error=${encodeURIComponent(message)}`
  return NextResponse.redirect(url)
}

export async function GET(req: NextRequest) {
  const next = req.nextUrl.searchParams.get('next') || '/'
  const stateNonce = crypto.randomBytes(16).toString('hex')
  const state = stateNonce + '.' + Buffer.from(next, 'utf8').toString('base64url')

  let url: string
  try {
    url = await buildGoogleAuthUrl(state, getCallbackUrl(req))
  } catch (err) {
    return loginErrorRedirect(req, `OAuth 尚未設定：${(err as Error).message}`)
  }

  const res = NextResponse.redirect(url)
  res.cookies.set(STATE_COOKIE, stateNonce, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
    secure: req.nextUrl.protocol === 'https:',
  })
  return res
}
