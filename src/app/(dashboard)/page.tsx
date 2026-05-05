import { isLocalMode } from '@/lib/local-mode'
import {
  mockSocialPosts,
  postCategoryMap,
  mockVolumeKPI,
} from '@/lib/mock-data'
import type { PrAlert, SocialCategory } from '@/lib/mock-data'
import type { SocialPost } from '@/types'
import { DashboardClient } from './dashboard-client'
import { getMonthlyOverview, type MonthlyOverview } from '@/lib/monthly-survey-store'
import { detectAlerts, filterRecentPosts } from '@/lib/pr-alerts'

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

  return (
    <DashboardClient
      volumeKPI={volumeKPI}
      alerts={alerts}
      recentPosts={recentPosts}
      postCategories={postCategories}
      monthlyOverview={monthlyOverview}
    />
  )
}
