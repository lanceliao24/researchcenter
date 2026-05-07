import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Cron not configured' }, { status: 503 })
  }
  const auth = request.headers.get('authorization') || ''
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
  try {
    const res = await fetch(`${baseUrl}/api/social/fetch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
      },
    })
    const data = await res.json()
    return NextResponse.json({ success: true, ...data })
  } catch (err) {
    console.error('Cron social fetch error:', err)
    return NextResponse.json({ success: false, error: 'Fetch failed' }, { status: 500 })
  }
}
