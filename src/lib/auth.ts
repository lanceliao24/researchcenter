import { NextRequest, NextResponse } from 'next/server'
import { SignJWT, jwtVerify, createRemoteJWKSet, type JWTPayload } from 'jose'
import { cookies } from 'next/headers'

export const SESSION_COOKIE = 'rc_session'
export const STATE_COOKIE = 'rc_oauth_state'
const SESSION_TTL_SEC = 7 * 24 * 3600

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token'
const GOOGLE_ISSUER = 'https://accounts.google.com'
const GOOGLE_JWKS_URL = new URL('https://www.googleapis.com/oauth2/v3/certs')

export type Role = 'editor' | 'viewer'

export interface Session {
  email: string
  name: string
  picture?: string
  role: Role
  exp: number
}

function getEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env: ${name}`)
  return v
}

function getOptionalEnv(name: string): string | undefined {
  return process.env[name] || undefined
}

function isDevBypass(): boolean {
  return process.env.NODE_ENV === 'development' && process.env.AUTH_DEV_BYPASS === '1'
}

function devSession(): Session {
  return {
    email: 'dev@local',
    name: 'Dev User',
    role: 'editor',
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SEC,
  }
}

function getSecret(): Uint8Array {
  const secret = getEnv('AUTH_SECRET')
  if (secret.length < 32) {
    throw new Error('AUTH_SECRET must be at least 32 chars')
  }
  return new TextEncoder().encode(secret)
}

export function isEditor(email: string): boolean {
  const list = (getOptionalEnv('EDITOR_EMAILS') || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
  return list.includes(email.toLowerCase())
}

export function isAllowedEmail(email: string): boolean {
  const lower = email.toLowerCase()
  const explicitList = (getOptionalEnv('ALLOWED_EMAILS') || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
  if (explicitList.includes(lower)) return true

  const domain = getOptionalEnv('ALLOWED_EMAIL_DOMAIN')
  if (domain && lower.endsWith('@' + domain.toLowerCase())) return true

  return false
}

export function roleFor(email: string): Role {
  return isEditor(email) ? 'editor' : 'viewer'
}

export async function signSession(payload: Omit<Session, 'exp'>): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SEC
  const jwt = await new SignJWT({ ...payload } as unknown as JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(getSecret())
  return jwt
}

export async function verifySession(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ['HS256'] })
    if (typeof payload.email !== 'string' || typeof payload.role !== 'string') return null
    if (payload.role !== 'editor' && payload.role !== 'viewer') return null
    return {
      email: payload.email,
      name: typeof payload.name === 'string' ? payload.name : payload.email,
      picture: typeof payload.picture === 'string' ? payload.picture : undefined,
      role: payload.role,
      exp: typeof payload.exp === 'number' ? payload.exp : 0,
    }
  } catch {
    return null
  }
}

export async function getSessionFromRequest(req: NextRequest): Promise<Session | null> {
  if (isDevBypass()) return devSession()
  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (!token) return null
  return verifySession(token)
}

export async function getSessionFromCookies(): Promise<Session | null> {
  if (isDevBypass()) return devSession()
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return null
  return verifySession(token)
}

export async function requireUser(req: NextRequest): Promise<Session | NextResponse> {
  const s = await getSessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return s
}

export async function requireEditor(req: NextRequest): Promise<Session | NextResponse> {
  const s = await getSessionFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (s.role !== 'editor') {
    return NextResponse.json({ error: 'Forbidden: editor role required' }, { status: 403 })
  }
  return s
}

export function isCronRequest(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = req.headers.get('authorization') || ''
  return auth === `Bearer ${secret}`
}

export async function requireEditorOrCron(
  req: NextRequest,
): Promise<Session | { cron: true } | NextResponse> {
  if (isCronRequest(req)) return { cron: true }
  return requireEditor(req)
}

export function isResponse(value: Session | NextResponse): value is NextResponse {
  return value instanceof NextResponse
}

// ---- Google OAuth helpers ----

const googleJwks = createRemoteJWKSet(GOOGLE_JWKS_URL)

export interface GoogleIdClaims {
  email: string
  name?: string
  picture?: string
  email_verified?: boolean
}

export async function buildGoogleAuthUrl(state: string, redirectUri: string): Promise<string> {
  const params = new URLSearchParams({
    client_id: getEnv('GOOGLE_CLIENT_ID'),
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    prompt: 'select_account',
    state,
  })
  return `${GOOGLE_AUTH}?${params.toString()}`
}

export async function exchangeGoogleCode(
  code: string,
  redirectUri: string,
): Promise<{ id_token: string }> {
  const body = new URLSearchParams({
    code,
    client_id: getEnv('GOOGLE_CLIENT_ID'),
    client_secret: getEnv('GOOGLE_CLIENT_SECRET'),
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  })
  const res = await fetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Google token exchange failed (${res.status}): ${text.slice(0, 200)}`)
  }
  const json = (await res.json()) as { id_token?: string }
  if (!json.id_token) throw new Error('Google response missing id_token')
  return { id_token: json.id_token }
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdClaims> {
  const { payload } = await jwtVerify(idToken, googleJwks, {
    issuer: [GOOGLE_ISSUER, 'accounts.google.com'],
    audience: getEnv('GOOGLE_CLIENT_ID'),
  })
  if (typeof payload.email !== 'string') throw new Error('id_token missing email')
  if (payload.email_verified === false) throw new Error('email not verified')
  return {
    email: payload.email,
    name: typeof payload.name === 'string' ? payload.name : undefined,
    picture: typeof payload.picture === 'string' ? payload.picture : undefined,
    email_verified: payload.email_verified === true,
  }
}

export function buildSessionCookieHeader(token: string, secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_TTL_SEC}`,
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export function buildClearSessionCookieHeader(secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}
