import { isLocalMode } from '@/lib/local-mode'
import {
  mockSocialPosts,
  postCategoryMap,
  mockPrAlerts,
  mockVolumeKPI,
} from '@/lib/mock-data'
import type { SocialCategory } from '@/lib/mock-data'
import type { SocialPost } from '@/types'
import { DashboardClient } from './dashboard-client'
import { getMonthlyOverview, type MonthlyOverview } from '@/lib/monthly-survey-store'

function classifyCategoryLocal(post: SocialPost): SocialCategory {
  const text = `${post.title ?? ''} ${post.description ?? ''} ${post.keyword ?? ''}`.toLowerCase()
  if (/機車|wemo|goshare|共享機車|電動機車/.test(text)) return '共享機車'
  if (/計程車|taxi|叫車|司機|uber|yoxi|55688/.test(text)) return '計程車'
  return '租車'
}

function computeVolumeFromPosts(posts: SocialPost[]) {
  const positive = posts.filter(p => p.sentiment === 'positive').length
  const negative = posts.filter(p => p.sentiment === 'negative').length
  return {
    positive: { week: positive, prevWeek: mockVolumeKPI.positive.prevWeek },
    negative: { week: negative, prevWeek: mockVolumeKPI.negative.prevWeek },
    net: { week: positive - negative, prevWeek: mockVolumeKPI.net.prevWeek },
    alertsActive: mockPrAlerts.length,
  }
}

export default async function DashboardPage() {
  let recentPosts = mockSocialPosts
  let postCategories = postCategoryMap
  let volumeKPI = mockVolumeKPI
  let monthlyOverview: MonthlyOverview | null = null

  if (isLocalMode()) {
    const { getPosts } = await import('@/lib/social-store')
    const localPosts = getPosts()
    if (localPosts.length > 0) {
      recentPosts = localPosts
      postCategories = Object.fromEntries(localPosts.map(p => [p.id, classifyCategoryLocal(p)]))
      volumeKPI = computeVolumeFromPosts(localPosts)
    }
    monthlyOverview = getMonthlyOverview()
  }

  return (
    <DashboardClient
      volumeKPI={volumeKPI}
      alerts={mockPrAlerts}
      recentPosts={recentPosts}
      postCategories={postCategories}
      monthlyOverview={monthlyOverview}
    />
  )
}
