import { NextRequest, NextResponse } from 'next/server'
import { isLocalMode } from '@/lib/local-mode'
import { mockSocialPosts } from '@/lib/mock-data'
import { buildWeeklyVolume } from '@/lib/pr-alerts'
import type { SocialPost } from '@/types'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const weeks = Math.min(24, Math.max(2, Number(req.nextUrl.searchParams.get('weeks') ?? 8)))
  let posts: SocialPost[] = mockSocialPosts
  let usedMock = true
  if (isLocalMode()) {
    const { getPosts } = await import('@/lib/social-store')
    const local = getPosts()
    if (local.length >= 10) {
      posts = local
      usedMock = false
    }
  }
  const trend = buildWeeklyVolume(posts, weeks)
  return NextResponse.json({ trend, usedMock, totalPosts: posts.length, weeks })
}
