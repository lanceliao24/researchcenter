'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Radio,
  ArrowRight,
  Sparkles,
  AlertTriangle,
  ShieldAlert,
  Info,
  TrendingUp,
  TrendingDown,
  Activity,
  Search,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SocialPost } from '@/types'
import type { PrAlert, AlertLevel, SocialCategory } from '@/lib/mock-data'
import { socialCategories } from '@/lib/mock-data'
import { QUICK_ASK_PROMPTS } from '@/lib/quick-asks'
import { type MonthlyOverview } from '@/components/surveys/monthly-overview'
import { InsightsOverview } from '@/components/insights/insights-overview'
import { PriorityChips, type PriorityIssue } from '@/components/dashboard/PriorityChips'
import { ServiceHealthGrid, type ServiceHealth } from '@/components/dashboard/ServiceHealthGrid'

const sentimentColor: Record<string, string> = {
  positive: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  neutral: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
  negative: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}
const sentimentLabel: Record<string, string> = {
  positive: '正面', neutral: '中性', negative: '負面',
}

interface Props {
  volumeKPI: {
    positive: { week: number; prevWeek: number }
    negative: { week: number; prevWeek: number }
    net: { week: number; prevWeek: number }
    alertsActive: number
  }
  alerts: PrAlert[]
  recentPosts: SocialPost[]
  postCategories: Record<number, SocialCategory>
  monthlyOverview: MonthlyOverview | null
  priorityIssues?: PriorityIssue[]
  serviceHealth?: ServiceHealth[]
}

export function DashboardClient({
  volumeKPI,
  alerts,
  recentPosts,
  postCategories,
  priorityIssues = [],
  serviceHealth = [],
}: Props) {
  const [categoryFilter, setCategoryFilter] = useState<SocialCategory | 'all'>('all')
  const [page, setPage] = useState(1)
  const POSTS_PER_PAGE = 5

  const filteredPosts = categoryFilter === 'all'
    ? recentPosts
    : recentPosts.filter(p => postCategories[p.id] === categoryFilter)

  const totalPages = Math.max(1, Math.ceil(filteredPosts.length / POSTS_PER_PAGE))
  const safePage = Math.min(page, totalPages)
  const pagedPosts = filteredPosts.slice((safePage - 1) * POSTS_PER_PAGE, safePage * POSTS_PER_PAGE)

  // Reset page when category changes
  function selectCategory(cat: SocialCategory | 'all') {
    setCategoryFilter(cat)
    setPage(1)
  }

  const categoryCounts: Record<string, number> = { all: recentPosts.length }
  for (const c of socialCategories) {
    categoryCounts[c] = recentPosts.filter(p => postCategories[p.id] === c).length
  }
  function timeAgo(dateStr: string | null) {
    if (!dateStr) return ''
    const diff = Date.now() - new Date(dateStr).getTime()
    const hours = Math.floor(diff / 3600000)
    if (hours < 1) return '剛剛'
    if (hours < 24) return `${hours} 小時前`
    return `${Math.floor(hours / 24)} 天前`
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-8">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="text-xl font-bold">總覽</h1>
          <p className="text-xs text-muted-foreground hidden md:block">
            社群聲量 + 問卷 + 公關事件 · AI 自動洞察
          </p>
        </div>
        <div className="w-full md:w-[420px]">
          <AISearchBar prompts={QUICK_ASK_PROMPTS} />
        </div>
      </div>

      {/* Per-service health overview */}
      {serviceHealth.length > 0 && <ServiceHealthGrid services={serviceHealth} />}

      {/* Priority issues — pulled from latest issue-trends snapshot */}
      {priorityIssues.length > 0 && <PriorityChips issues={priorityIssues} />}

      {/* Row 1: 洞察總覽（Pro narrative）+ 社群風險（聲量 + 公關預警合一） */}
      <div className="grid gap-6 lg:grid-cols-2">
        <InsightsOverview />
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Radio className="h-4 w-4 text-muted-foreground" />
              社群風險面板
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <KpiCard
                label="正向聲量 (本週)"
                value={volumeKPI.positive.week}
                prev={volumeKPI.positive.prevWeek}
                tone="positive"
                icon={TrendingUp}
              />
              <KpiCard
                label="負向聲量 (本週)"
                value={volumeKPI.negative.week}
                prev={volumeKPI.negative.prevWeek}
                tone="negative"
                icon={TrendingDown}
                invertDelta
              />
            </div>
            <AlertsCard alerts={alerts} embedded />
          </CardContent>
        </Card>
      </div>

      {/* Row 2: 最近社群討論 — 帶分類 sidebar */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Radio className="h-4 w-4 text-muted-foreground" />
            最近社群討論
          </CardTitle>
          <Link href="/social" className="text-xs text-primary hover:underline font-medium">
            查看全部 →
          </Link>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-[140px_1fr] gap-4">
            {/* Category sidebar */}
            <div className="flex flex-row md:flex-col gap-1 overflow-x-auto md:overflow-visible md:border-r md:pr-3">
              {(['all', ...socialCategories] as const).map(cat => {
                const isActive = categoryFilter === cat
                const label = cat === 'all' ? '全部' : cat
                const count = categoryCounts[cat] ?? 0
                return (
                  <button
                    key={cat}
                    onClick={() => selectCategory(cat)}
                    className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-xs whitespace-nowrap transition-colors ${
                      isActive
                        ? 'bg-accent font-semibold text-foreground'
                        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                    }`}
                  >
                    <span>{label}</span>
                    <span className={`tabular-nums text-xs ${isActive ? 'text-muted-foreground' : 'text-muted-foreground/70'}`}>
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Posts list */}
            <div className="flex flex-col">
              <div className="divide-y flex-1">
                {pagedPosts.map((post) => (
                  <a
                    key={post.id}
                    href={post.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0 hover:bg-accent/30 -mx-2 px-2 rounded-lg transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium line-clamp-1">{post.title}</p>
                      <div className="flex gap-1.5 mt-1 items-center flex-wrap">
                        <Badge variant="outline" className="text-[10px] py-0">{post.platform}</Badge>
                        {post.sentiment && (
                          <span className={`text-[10px] px-1.5 py-0 rounded ${sentimentColor[post.sentiment]}`}>
                            {sentimentLabel[post.sentiment]}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0 mt-0.5">{timeAgo(post.published_at)}</span>
                  </a>
                ))}
                {pagedPosts.length === 0 && (
                  <p className="text-xs text-muted-foreground py-4 text-center">
                    {filteredPosts.length === 0 ? `沒有「${categoryFilter}」分類的貼文` : '沒有貼文'}
                  </p>
                )}
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-3 mt-2 border-t text-xs">
                  <span className="text-muted-foreground tabular-nums">
                    {(safePage - 1) * POSTS_PER_PAGE + 1}–{Math.min(safePage * POSTS_PER_PAGE, filteredPosts.length)} / {filteredPosts.length} 篇
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={safePage <= 1}
                      className="h-7 w-7 rounded border inline-flex items-center justify-center hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <span className="px-2 tabular-nums text-muted-foreground">
                      {safePage} / {totalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={safePage >= totalPages}
                      className="h-7 w-7 rounded border inline-flex items-center justify-center hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

    </div>
  )
}

function AISearchBar({ }: { prompts: string[] }) {
  const router = useRouter()
  const [q, setQ] = useState('')

  function submit(value?: string) {
    const text = (value ?? q).trim()
    if (!text) return
    router.push(`/ask?q=${encodeURIComponent(text)}`)
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); submit() }}
      className="flex items-center gap-2 w-full"
    >
      <div className="relative flex-1">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="想追問什麼？例：本月計程車最常被抱怨..."
          className="pl-8 h-9 text-sm"
        />
      </div>
      <Button type="submit" disabled={!q.trim()} size="sm" className="h-9 px-3 text-xs">
        <Sparkles className="h-3.5 w-3.5 mr-1" />
        問 AI
      </Button>
    </form>
  )
}

/* ----------- Subcomponents ----------- */

function AlertsCard({ alerts, embedded = false }: { alerts: PrAlert[]; embedded?: boolean }) {
  const critical = alerts.filter(a => a.level === 'critical').length
  if (embedded) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <ShieldAlert className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">公關事件預警</span>
            {alerts.length > 0 && (
              <Badge
                variant="outline"
                className={cn(
                  'text-[10px] py-0',
                  critical > 0
                    ? 'border-red-500/50 text-red-600 dark:text-red-400'
                    : 'border-amber-500/50 text-amber-600 dark:text-amber-400'
                )}
              >
                {alerts.length} 則
              </Badge>
            )}
          </div>
          <Link href="/social" className="text-xs text-primary hover:underline font-medium">
            查看全部
          </Link>
        </div>
        {alerts.length === 0 ? (
          <div className="text-xs text-muted-foreground py-2 flex items-center gap-1">
            <Info className="h-3.5 w-3.5 text-muted-foreground/60" />
            目前無公關事件
          </div>
        ) : (
          <div className="space-y-1.5">
            {alerts.slice(0, 3).map(a => (
              <AlertRow key={a.id} alert={a} />
            ))}
          </div>
        )}
      </div>
    )
  }
  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          公關事件預警
          {alerts.length > 0 && (
            <Badge
              variant="outline"
              className={cn(
                'ml-1 text-[10px] py-0',
                critical > 0
                  ? 'border-red-500/50 text-red-600 dark:text-red-400'
                  : 'border-amber-500/50 text-amber-600 dark:text-amber-400'
              )}
            >
              {alerts.length} 則
            </Badge>
          )}
        </CardTitle>
        <Link href="/social" className="text-xs text-primary hover:underline font-medium">
          查看全部
        </Link>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            <Info className="h-5 w-5 mx-auto mb-1 text-muted-foreground/60" />
            目前無公關事件
          </div>
        ) : (
          <div className="space-y-2">
            {alerts.map(a => (
              <AlertRow key={a.id} alert={a} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function AlertRow({ alert }: { alert: PrAlert }) {
  const labels: Record<AlertLevel, { label: string; badge: string }> = {
    critical: {
      label: '高風險',
      badge: 'border-red-500/50 text-red-600 dark:text-red-400 bg-red-50/60 dark:bg-red-950/20',
    },
    warning: {
      label: '注意',
      badge: 'border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-50/60 dark:bg-amber-950/20',
    },
    info: {
      label: '資訊',
      badge: 'border-border text-muted-foreground',
    },
  }
  const s = labels[alert.level]
  return (
    <div className="rounded-md border px-3 py-2">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="outline" className={cn('text-[10px] py-0', s.badge)}>
              {s.label}
            </Badge>
            <Badge variant="secondary" className="text-[10px] py-0">
              {alert.category}
            </Badge>
            <span className="text-xs text-muted-foreground">{alert.source}</span>
          </div>
          <p className="text-sm font-medium mt-1 line-clamp-1">{alert.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{alert.detail}</p>
          <div className="text-xs text-muted-foreground/80 mt-1">
            觸發規則：{alert.trigger}
          </div>
        </div>
      </div>
    </div>
  )
}

function KpiCard({
  label,
  value,
  prev,
  tone,
  icon: Icon,
  invertDelta = false,
  hint,
}: {
  label: string
  value: number
  prev?: number
  tone: 'positive' | 'negative' | 'net' | 'alert'
  icon: React.ComponentType<{ className?: string }>
  invertDelta?: boolean
  hint?: string
}) {
  const toneStyles: Record<typeof tone, string> = {
    positive: 'text-green-600 dark:text-green-400',
    negative: 'text-red-600 dark:text-red-400',
    net: 'text-foreground',
    alert: value > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground',
  }

  let delta: number | null = null
  if (typeof prev === 'number' && prev !== 0) {
    delta = ((value - prev) / prev) * 100
  }

  const deltaIsGood = delta === null ? null : invertDelta ? delta < 0 : delta > 0
  const deltaColor =
    delta === null
      ? 'text-muted-foreground'
      : deltaIsGood
        ? 'text-green-600 dark:text-green-400'
        : 'text-red-600 dark:text-red-400'

  return (
    <Card>
      <CardContent className="py-4 px-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{label}</span>
          <Icon className={cn('h-4 w-4', toneStyles[tone])} />
        </div>
        <div className={cn('text-3xl font-bold tracking-tight mt-2', toneStyles[tone])}>
          {value.toLocaleString()}
        </div>
        <div className="mt-1 text-xs">
          {delta !== null ? (
            <span className={deltaColor}>
              {delta > 0 ? '▲' : delta < 0 ? '▼' : '—'} {Math.abs(delta).toFixed(1)}%
              <span className="text-muted-foreground ml-1">vs 上週</span>
            </span>
          ) : hint ? (
            <span className="text-muted-foreground">{hint}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

