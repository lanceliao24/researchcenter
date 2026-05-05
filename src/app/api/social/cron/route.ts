import { NextResponse } from 'next/server'

export async function GET() {
  // Vercel Cron calls this endpoint
  // Trigger the social fetch internally
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  try {
    const res = await fetch(`${baseUrl}/api/social/fetch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    const data = await res.json()
    return NextResponse.json({ success: true, ...data })
  } catch (err) {
    console.error('Cron social fetch error:', err)
    return NextResponse.json({ success: false, error: 'Fetch failed' }, { status: 500 })
  }
}
