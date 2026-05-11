import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'

const PUBLIC_PATHS = [
  '/login',
  '/api/auth/google/start',
  '/api/auth/google/callback',
  '/api/auth/logout',
  '/api/social/cron',
  '/api/health',
]

const PUBLIC_PREFIXES = ['/_next/', '/favicon']

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true
  if (PUBLIC_PREFIXES.some(p => pathname.startsWith(p))) return true
  return false
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  if (isPublic(pathname)) return NextResponse.next()

  const session = await getSessionFromRequest(request)
  if (session) return NextResponse.next()

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const loginUrl = request.nextUrl.clone()
  loginUrl.pathname = '/login'
  loginUrl.search = `?next=${encodeURIComponent(pathname + search)}`
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
