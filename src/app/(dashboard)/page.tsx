import { isLocalMode } from '@/lib/local-mode'
import {
  mockSocialPosts,
  postCategoryMap,
  mockVolumeKPI,
} from '@/lib/mock-data'
import type { PrAlert, SocialCategory } from '@/lib/mock-data'
import type { SocialPost } from '@/types'
import { DashboardClient } from './dashboard-client'
import { getMonthlyOverview, listMonths, listMetricsByMonth, type MonthlyOverview } from '@/lib/monthly-survey-store'
import { detectAlerts, filterRecentPosts } from '@/lib/pr-alerts'
import { readIssueTrends, getServiceLabel } from '@/lib/issue-trends-store'
import type { PriorityIssue } from '@/components/dashboard/PriorityChips'
import type { ServiceHealth } from '@/components/dashboard/ServiceHealthGrid'

const FEATURED_SERVICES = ['taxi', 'rental', 'scooter', 'shuttle']

function classifyCategoryLocal(post: SocialPost): SocialCategory {
  const text = `${post.title ?? ''} ${post.description ?? ''} ${post.keyword ?? ''}`.toLowerCase()
  if (/機車|wemo|goshare|共享機車|電動機車/.test(text)) return '共享機車'
  if (/計程車|taxi|叫車|司機|uber|yoxi|55688/.test(text)) return '計程車'
  return '租車'
}

function computeVolumeFromPosts(posts: SocialPost[], alertCount: number) {
  const positive = posts.filter(p => p.sentiment === 'positive').length
  const negative = posts.filter(p => p.sentiment === 'negative').length
  return {
    positive: { week: positive, prevWeek: mockVolumeKPI.positive.prevWeek },
    negative: { week: negative, prevWeek: mockVolumeKPI.negative.prevWeek },
    net: { week: positive - negative, prevWeek: mockVolumeKPI.net.prevWeek },
    alertsActive: alertCount,
  }
}

export default async function DashboardPage() {
  let allPosts: SocialPost[] = mockSocialPosts
  let postCategories = postCategoryMap
  let volumeKPI = mockVolumeKPI
  let monthlyOverview: MonthlyOverview | null = null

  if (isLocalMode()) {
    const { getPosts } = await import('@/lib/social-store')
    const localPosts = getPosts()
    if (localPosts.length > 0) {
      allPosts = localPosts
      postCategories = Object.fromEntries(localPosts.map(p => [p.id, classifyCategoryLocal(p)]))
    }
    monthlyOverview = getMonthlyOverview()
  }

  const recentPosts: SocialPost[] = filterRecentPosts(allPosts, 6)
  const alerts: PrAlert[] = detectAlerts(allPosts)

  if (isLocalMode() && allPosts !== mockSocialPosts) {
    volumeKPI = computeVolumeFromPosts(allPosts, alerts.length)
  } else {
    volumeKPI = { ...mockVolumeKPI, alertsActive: alerts.length }
  }

  // Extract prioritize issues + per-service totals from issue-trends snapshot.
  const priorityIssues: PriorityIssue[] = []
  const prioritizeByService = new Map<string, { total: number; rising: number }>()
  const trends = readIssueTrends()
  if (trends && Array.isArray(trends.byService)) {
    for (const svc of trends.byService) {
      let total = 0
      let rising = 0
      for (const iss of svc.issues) {
        if (iss.recommended_action === 'prioritize') {
          total += 1
          if (iss.trend === 'rising') rising += 1
          priorityIssues.push({
            service: svc.service,
            serviceLabel: getServiceLabel(svc.service),
            title: iss.title,
            trend: iss.trend,
            impact: iss.impact ?? 'high',
            confidence: iss.confidence ?? 'medium',
          })
        }
      }
      prioritizeByService.set(svc.service, { total, rising })
    }
  }

  // Per-service health for the 4 featured services, latest month available.
  const serviceHealth: ServiceHealth[] = []
  if (isLocalMode()) {
    const months = listMonths()
    const latestMonth = months[0]
    if (latestMonth) {
      const metrics = listMetricsByMonth(latestMonth)
      const byService = new Map(metrics.map(m => [m.service, m]))
      for (const svc of FEATURED_SERVICES) {
        const m = byService.get(svc)
        if (!m) continue
        const p = prioritizeByService.get(svc)
        serviceHealth.push({
          service: svc,
          label: getServiceLabel(svc),
          month: m.month,
          responses: m.responses,
          nps: m.nps,
          satisfied_pct: m.satisfied_pct,
          prioritizeCount: p?.total ?? 0,
          risingCount: p?.rising ?? 0,
        })
      }
    }
  }

  return (
    <DashboardClient
      volumeKPI={volumeKPI}
      alerts={alerts}
      recentPosts={recentPosts}
      monthlyOverview={monthlyOverview}
      priorityIssues={priorityIssues}
      serviceHealth={serviceHealth}
    />
  )
}
