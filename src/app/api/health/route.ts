import { NextResponse } from 'next/server'

// Liveness probe — no auth, no I/O. Returns 200 if the process is up.
// Add as a public path in proxy.ts so the LB can hit it without a session.
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    ts: new Date().toISOString(),
  })
}
