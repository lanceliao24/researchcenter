import { NextRequest, NextResponse } from 'next/server'
import { isLocalMode } from '@/lib/local-mode'
import { getKeywords, upsertPosts, getLastFetchedAt, pruneOlderThan } from '@/lib/social-store'
import { incrementQuota, getQuotaStatus } from '@/lib/quota'
import type { SocialPost } from '@/types'

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY

const platformMap: Record<string, string> = {
  'dcard.tw': 'Dcard',
  'ptt.cc': 'PTT',
  'pttweb.cc': 'PTT',
  'threads.com': 'Threads',
  'threads.net': 'Threads',
  'mobile01.com': 'Mobile01',
  'instagram.com': 'Instagram',
  'facebook.com': 'Facebook',
  'youtube.com': 'YouTube',
}

function detectPlatform(url: string): string {
  for (const [domain, name] of Object.entries(platformMap)) {
    if (url.includes(domain)) return name
  }
  return 'Other'
}

function extractPttDate(url: string): string | null {
  const m = url.match(/M\.(\d{10})\.A/)
  if (!m) return null
  const ts = parseInt(m[1], 10) * 1000
  if (Number.isNaN(ts)) return null
  return new Date(ts).toISOString()
}

interface FirecrawlItem {
  url?: string
  title?: string
  description?: string
  publishedDate?: string
}

function buildQuery(keyword: string): string {
  const upper = keyword.toUpperCase()
  const hasBrand = upper.includes('LINE GO') || upper.includes('LINE TAXI') || upper.includes('LINEGO')
  const brandClause = hasBrand ? `"${keyword}"` : `"${keyword}" ("LINE GO" OR "LINE TAXI")`
  return `${brandClause} (site:dcard.tw OR site:ptt.cc OR site:pttweb.cc OR site:mobile01.com OR site:threads.com OR site:threads.net)`
}

const RECENT_MONTHS = 6
const RECENT_MS = RECENT_MONTHS * 30 * 24 * 60 * 60 * 1000

function getRecentDateRangeTbs(): string {
  const min = new Date(Date.now() - RECENT_MS)
  const max = new Date()
  const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`
  return `cdr:1,cd_min:${fmt(min)},cd_max:${fmt(max)}`
}

async function firecrawlSearch(keyword: string): Promise<FirecrawlItem[]> {
  const res = await fetch('https://api.firecrawl.dev/v1/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
    },
    body: JSON.stringify({
      query: buildQuery(keyword),
      limit: 10,
      country: 'tw',
      lang: 'zh-TW',
      tbs: getRecentDateRangeTbs(),
    }),
  })
  const data = await res.json()
  return data?.data?.web || data?.data || []
}

function isRecent(iso: string | null): boolean {
  // 沒 publishedDate 時信任 Google `cdr:1, 6mo` filter（已收緊到 6 個月）
  if (!iso) return true
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return true
  return Date.now() - t < RECENT_MS
}

export async function GET() {
  return NextResponse.json({
    lastFetchedAt: isLocalMode() ? getLastFetchedAt() : null,
    quota: getQuotaStatus('firecrawl_search'),
  })
}

export async function POST(request: NextRequest) {
  if (!FIRECRAWL_API_KEY || FIRECRAWL_API_KEY.includes('placeholder')) {
    return NextResponse.json({ error: 'FIRECRAWL_API_KEY not configured' }, { status: 500 })
  }

  const quotaStatus = getQuotaStatus('firecrawl_search')
  if (quotaStatus.remaining <= 0) {
    return NextResponse.json(
      { error: `今日社群爬取額度已用完 (${quotaStatus.used}/${quotaStatus.limit})`, quota: quotaStatus },
      { status: 429 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const requestedKeywords: string[] | undefined = body?.keywords

  if (isLocalMode()) {
    const kws = requestedKeywords?.length
      ? requestedKeywords
      : getKeywords().filter(k => k.is_active).map(k => k.keyword)

    if (!kws.length) return NextResponse.json({ inserted: 0, message: 'No active keywords' })

    const pruned = pruneOlderThan(RECENT_MONTHS * 30)

    const toFetch = kws.slice(0, quotaStatus.remaining)
    let totalInserted = 0
    const now = new Date().toISOString()

    for (const keyword of toFetch) {
      try {
        const results = await firecrawlSearch(keyword)
        incrementQuota('firecrawl_search')

        const posts: Omit<SocialPost, 'id'>[] = results
          .filter(r => r.url)
          .map(r => ({
            keyword,
            platform: detectPlatform(r.url!),
            title: r.title || null,
            url: r.url!,
            description: r.description || null,
            sentiment: null,
            fetched_at: now,
            published_at: r.publishedDate || extractPttDate(r.url!) || null,
          }))
          .filter(p => isRecent(p.published_at))

        totalInserted += upsertPosts(posts)
      } catch (err) {
        console.error(`Error fetching "${keyword}":`, err)
      }
    }

    return NextResponse.json({
      inserted: totalInserted,
      pruned,
      keywordsFetched: toFetch,
      quota: getQuotaStatus('firecrawl_search'),
    })
  }

  // Remote (Supabase) path — unchanged original behavior
  const { createServiceClient } = await import('@/lib/supabase/server')
  const supabase = await createServiceClient()
  const { data: keywords } = await supabase.from('keywords').select('keyword').eq('is_active', true)
  if (!keywords?.length) return NextResponse.json({ message: 'No active keywords' })

  let totalInserted = 0
  for (const { keyword } of keywords) {
    try {
      const results = await firecrawlSearch(keyword)
      incrementQuota('firecrawl_search')
      for (const item of results) {
        if (!item.url) continue
        const { error } = await supabase.from('social_posts').upsert(
          {
            keyword,
            platform: detectPlatform(item.url),
            title: item.title || null,
            url: item.url,
            description: item.description || null,
            fetched_at: new Date().toISOString(),
          },
          { onConflict: 'url' }
        )
        if (!error) totalInserted++
      }
    } catch (err) {
      console.error(`Error fetching keyword "${keyword}":`, err)
    }
  }

  return NextResponse.json({ inserted: totalInserted })
}
