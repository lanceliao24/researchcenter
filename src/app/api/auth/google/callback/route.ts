import { NextRequest, NextResponse } from 'next/server'
import {
  STATE_COOKIE,
  SESSION_COOKIE,
  exchangeGoogleCode,
  verifyGoogleIdToken,
  isAllowedEmail,
  roleFor,
  signSession,
  buildSessionCookieHeader,
} from '@/lib/auth'

function getCallbackUrl(req: NextRequest): string {
  const base = process.env.AUTH_BASE_URL || req.nextUrl.origin
  return `${base}/api/auth/google/callback`
}

function loginErrorRedirect(req: NextRequest, message: string): NextResponse {
  const url = req.nextUrl.clone()
  url.pathname = '/login'
  url.search = `?error=${encodeURIComponent(message)}`
  const res = NextResponse.redirect(url)
  res.cookies.delete(STATE_COOKIE)
  return res
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const stateCookie = req.cookies.get(STATE_COOKIE)?.value

  if (!code || !state) return loginErrorRedirect(req, '缺少 code 或 state')
  if (!stateCookie) return loginErrorRedirect(req, 'State cookie 失效，請重新登入')

  const [nonce, nextEncoded] = state.split('.')
  if (nonce !== stateCookie) return loginErrorRedirect(req, 'State mismatch')

  let nextPath = '/'
  try {
    const decoded = Buffer.from(nextEncoded || '', 'base64url').toString('utf8')
    if (decoded.startsWith('/') && !decoded.startsWith('//')) nextPath = decoded
  } catch {
    nextPath = '/'
  }

  let claims
  try {
    const { id_token } = await exchangeGoogleCode(code, getCallbackUrl(req))
    claims = await verifyGoogleIdToken(id_token)
  } catch (err) {
    return loginErrorRedirect(req, (err as Error).message.slice(0, 120))
  }

  if (!isAllowedEmail(claims.email)) {
    return loginErrorRedirect(req, `此帳號未授權：${claims.email}`)
  }

  const role = roleFor(claims.email)
  const token = await signSession({
    email: claims.email,
    name: claims.name || claims.email,
    picture: claims.picture,
    role,
  })

  const dest = req.nextUrl.clone()
  dest.pathname = nextPath
  dest.search = ''
  const res = NextResponse.redirect(dest)
  const secure = req.nextUrl.protocol === 'https:'
  res.headers.append('Set-Cookie', buildSessionCookieHeader(token, secure))
  res.cookies.delete(STATE_COOKIE)
  return res
}
