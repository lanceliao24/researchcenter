import { NextResponse } from 'next/server'
import { getPosts } from '@/lib/social-store'
import { mockSocialPosts } from '@/lib/mock-data'
import { aggregateWordsBySentiment } from '@/lib/social-tokens'

export async function GET() {
  const stored = getPosts()
  const posts = stored.length > 0 ? stored : mockSocialPosts
  const wordCloud = aggregateWordsBySentiment(posts, 30)
  return NextResponse.json({
    ...wordCloud,
    usedMock: stored.length === 0,
    sampledPosts: posts.length,
  })
}
