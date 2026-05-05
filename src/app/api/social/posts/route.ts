import { NextResponse } from 'next/server'
import { getPosts, getLastFetchedAt } from '@/lib/social-store'

export async function GET() {
  return NextResponse.json({
    posts: getPosts(),
    lastFetchedAt: getLastFetchedAt(),
  })
}
