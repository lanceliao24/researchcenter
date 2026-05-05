import type { SocialPost } from '@/types'
import type { PrAlert, SocialCategory } from './mock-data'

const DAY = 24 * 60 * 60 * 1000

function classifyCategory(text: string): SocialCategory {
  if (/機車|wemo|goshare|共享機車|電動機車/i.test(text)) return '共享機車'
  if (/計程車|taxi|叫車|司機|uber|yoxi|55688/i.test(text)) return '計程車'
  return '租車'
}

function postTimestamp(p: SocialPost): number | null {
  const src = p.published_at ?? p.fetched_at
  if (!src) return null
  const t = new Date(src).getTime()
  return Number.isNaN(t) ? null : t
}

function withinRange(p: SocialPost, now: number, fromDays: number, toDays: number): boolean {
  const t = postTimestamp(p)
  if (t === null) return false
  const ageDays = (now - t) / DAY
  return ageDays >= fromDays && ageDays <= toDays
}

export interface DetectAlertsOptions {
  now?: number
  spikeWindowDays?: number
  spikeMultiplier?: number
  clusterWindowDays?: number
  clusterMinCount?: number
}

export function detectAlerts(posts: SocialPost[], opts: DetectAlertsOptions = {}): PrAlert[] {
  if (posts.length === 0) return []
  const now = opts.now ?? Date.now()
  const spikeWindow = opts.spikeWindowDays ?? 14
  const spikeMultiplier = opts.spikeMultiplier ?? 2
  const clusterWindow = opts.clusterWindowDays ?? 30
  const clusterMin = opts.clusterMinCount ?? 3

  const alerts: PrAlert[] = []

  // 1. critical: 近 N 天負向 vs 前 N 天倍增
  const recent = posts.filter(p => p.sentiment === 'negative' && withinRange(p, now, 0, spikeWindow))
  const prior = posts.filter(p => p.sentiment === 'negative' && withinRange(p, now, spikeWindow, spikeWindow * 2))
  if (prior.length >= clusterMin && recent.length >= prior.length * spikeMultiplier) {
    const sorted = recent
      .map(p => ({ p, t: postTimestamp(p) }))
      .filter((x): x is { p: SocialPost; t: number } => x.t !== null)
      .sort((a, b) => b.t - a.t)
      .map(x => x.p)
    const latest = sorted[0]
    const platforms = Array.from(new Set(recent.map(p => p.platform))).slice(0, 3)
    const growth = Math.round((recent.length / prior.length - 1) * 100)
    alerts.push({
      id: 'alert-volume-spike',
      level: 'critical',
      title: `負向聲量近 ${spikeWindow} 天倍增`,
      detail: `近 ${spikeWindow} 天負向 ${recent.length} 則 vs 前 ${spikeWindow} 天 ${prior.length} 則（+${growth}%）`,
      source: platforms.join(' / '),
      category: latest ? classifyCategory(`${latest.title ?? ''} ${latest.description ?? ''} ${latest.keyword ?? ''}`) : '租車',
      trigger: `負面聲量 ${spikeWindow} 天內 +${spikeMultiplier * 100 - 100}%`,
      occurred_at: latest?.published_at ?? new Date(now).toISOString(),
    })
  }

  // 2. warning: keyword cluster
  const clusterPool = posts.filter(p => p.sentiment === 'negative' && withinRange(p, now, 0, clusterWindow))
  const byKeyword = new Map<string, SocialPost[]>()
  for (const p of clusterPool) {
    const k = (p.keyword ?? '其他').trim() || '其他'
    if (!byKeyword.has(k)) byKeyword.set(k, [])
    byKeyword.get(k)!.push(p)
  }

  const clusters = Array.from(byKeyword.entries())
    .filter(([, arr]) => arr.length >= clusterMin)
    .sort((a, b) => b[1].length - a[1].length)

  for (const [keyword, items] of clusters.slice(0, 3)) {
    const withTime = items
      .map(p => ({ p, t: postTimestamp(p) }))
      .filter((x): x is { p: SocialPost; t: number } => x.t !== null)
      .sort((a, b) => b.t - a.t)
    const latest = withTime[0]?.p
    const latestT = withTime[0]?.t
    const platforms = Array.from(new Set(items.map(p => p.platform))).slice(0, 3)
    const titleSnippet = latest?.title ? latest.title.slice(0, 30) : ''
    alerts.push({
      id: `alert-cluster-${keyword.replace(/\s+/g, '-')}`,
      level: 'warning',
      title: `${keyword} 負向討論集中`,
      detail: `近 ${clusterWindow} 天 ${platforms.join('、')} 共 ${items.length} 則負向${titleSnippet ? `，最新「${titleSnippet}」` : ''}`,
      source: platforms.join(' / '),
      category: classifyCategory(keyword),
      trigger: `同關鍵字 ${clusterWindow} 天內負向 ≥ ${clusterMin} 則`,
      occurred_at: latest?.published_at ?? (latestT ? new Date(latestT).toISOString() : new Date(now).toISOString()),
    })
  }

  return alerts.slice(0, 5)
}

export function filterRecentPosts(posts: SocialPost[], monthsBack: number, now = Date.now()): SocialPost[] {
  const cutoff = now - monthsBack * 30 * DAY
  return posts.filter(p => {
    const t = postTimestamp(p)
    if (t === null) return true
    return t >= cutoff
  })
}
