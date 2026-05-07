import fs from 'fs'
import { storePath, ensureDir, STORE_DIR } from './paths'
import type { Session } from './auth'

const LOG_PATH = storePath('audit-log.ndjson')

export interface AuditEvent {
  ts: string
  email: string
  role: string
  action: string
  resource: string | null
  details?: Record<string, unknown>
}

export function logAudit(
  session: Pick<Session, 'email' | 'role'>,
  action: string,
  resource: string | null = null,
  details?: Record<string, unknown>,
): void {
  ensureDir(STORE_DIR)
  const event: AuditEvent = {
    ts: new Date().toISOString(),
    email: session.email,
    role: session.role,
    action,
    resource,
    ...(details ? { details } : {}),
  }
  try {
    fs.appendFileSync(LOG_PATH, JSON.stringify(event) + '\n', 'utf8')
  } catch (err) {
    console.error('[audit] failed to write event:', err)
  }
}

export interface AuditQuery {
  email?: string
  action?: string
  since?: Date
  limit?: number
}

export function readAuditLog(query: AuditQuery = {}): AuditEvent[] {
  if (!fs.existsSync(LOG_PATH)) return []
  const limit = query.limit ?? 200
  const sinceMs = query.since?.getTime()
  const lines = fs.readFileSync(LOG_PATH, 'utf8').split('\n')
  const out: AuditEvent[] = []
  for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
    const line = lines[i].trim()
    if (!line) continue
    try {
      const ev = JSON.parse(line) as AuditEvent
      if (query.email && ev.email !== query.email) continue
      if (query.action && ev.action !== query.action) continue
      if (sinceMs && new Date(ev.ts).getTime() < sinceMs) continue
      out.push(ev)
    } catch {
      // skip malformed lines
    }
  }
  return out
}
