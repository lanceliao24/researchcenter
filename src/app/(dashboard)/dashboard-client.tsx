'use client'

import { useState, useEffect, useCallback } from 'react'
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
  Loader2,
  AlertTriangle,
  ShieldAlert,
  Info,
  TrendingUp,
  TrendingDown,
  Activity,
  Search,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SocialPost } from '@/types'
import type { SocialCategory, PrAlert, AlertLevel } from '@/lib/mock-data'
import { WordCloud } from '@/components/social/WordCloud'
import { QUICK_ASK_PROMPTS } from '@/lib/quick-asks'
import { MonthlyOverviewCard, type MonthlyOverview } from '@/components/surveys/monthly-overview'
import { InsightsOverview } from '@/components/insights/insights-overview'
import { TopicAlignmentCard } from '@/components/insights/topic-alignment'
import { QuotaPanel } from '@/components/quota/QuotaPanel'
import { PriorityChips, type PriorityIssue } from '@/components/dashboard/PriorityChips'

type CloudCategory = '租車' | '計程車' | '共享機車' | 'LINE GO 總覽'
type AnalysisShape = Record<CloudCategory, { positive: { word: string; count: number }[]; negative: { word: string; count: number }[] }>

function tabToCloudCategory(tab: SocialCategory | 'all'): CloudCategory {
  if (tab === 'all') return 'LINE GO 總覽'
  return tab as CloudCategory
}

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
}

export function DashboardClient({
  volumeKPI,
  alerts,
  recentPosts,
  postCategories,
  monthlyOverview,
  priorityIssues = [],
}: Props) {
  const [categoryFilter, setCategoryFilter] = useState<SocialCategory | 'all'>('all')
  const [analysis, setAnalysis] = useState<AnalysisShape | null>(null)
  const [analyzedAt, setAnalyzedAt] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeMsg, setAnalyzeMsg] = useState<string | null>(null)

  const loadAnalysis = useCallback(async () => {
    try {
      const res = await fetch('/api/social/analyze')
      const data = await res.json()
      setAnalysis(data.analysis ?? null)
      setAnalyzedAt(data.analyzedAt ?? null)
    } catch {}
  }, [])

  useEffect(() => { loadAnalysis() }, [loadAnalysis])

  async function runAnalyze() {
    setAnalyzing(true)
    setAnalyzeMsg(null)
    try {
      const res = await fetch('/api/social/analyze', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setAnalyzeMsg(data.error || '分析失敗')
      } else {
        setAnalysis(data.analysis)
        setAnalyzedAt(new Date().toISOString())
        setAnalyzeMsg(data.errors?.length ? `部分分類失敗：${data.errors.join('; ')}` : '分析完成')
      }
    } catch {
      setAnalyzeMsg('分析失敗')
    } finally {
      setAnalyzing(false)
    }
  }

  const filteredPosts = categoryFilter === 'all'
    ? recentPosts
    : recentPosts.filter(p => postCategories[p.id] === categoryFilter)

  const cloudCat = tabToCloudCategory(categoryFilter)
  const cloudData = analysis?.[cloudCat] ?? { positive: [], negative: [] }

  function timeAgo(dateStr: string | null) {
    if (!dateStr) return ''
    const diff = Date.now() - new Date(dateStr).getTime()
    const hours = Math.floor(diff / 3600000)
    if (hours < 1) return '剛剛'
    if (hours < 24) return `${hours} 小時前`
    return `${Math.floor(hours / 24)} 天前`
  }

  const categoryTabs: { key: SocialCategory | 'all'; label: string; count: number }[] = [
    { key: 'all', label: '全部', count: recentPosts.length },
    { key: '租車', label: '租車', count: recentPosts.filter(p => postCategories[p.id] === '租車').length },
    { key: '計程車', label: '計程車', count: recentPosts.filter(p => postCategories[p.id] === '計程車').length },
    { key: '共享機車', label: '共享機車', count: recentPosts.filter(p => postCategories[p.id] === '共享機車').length },
  ]

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">總覽</h1>
        <p className="text-sm text-muted-foreground mt-1">
          整合社群聲量、問卷回覆與公關事件，AI 自動產出洞察
        </p>
      </div>

      {/* Row 0: AI 搜尋框 */}
      <AISearchHero prompts={QUICK_ASK_PROMPTS} />

      {/* Priority issues — pulled from latest issue-trends snapshot */}
      {priorityIssues.length > 0 && <PriorityChips issues={priorityIssues} />}

      {/* Row 1: 左（月度問卷 → 洞察總覽）+ 右（聲量 → 公關預警） */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6 flex flex-col">
          <MonthlyOverviewCard overview={monthlyOverview} ctaHref="/surveys" />
          <div className="flex-1">
            <InsightsOverview />
          </div>
        </div>
        <div className="space-y-6 flex flex-col">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Radio className="h-4 w-4 text-muted-foreground" />
                最新社群聲量總覽
              </CardTitle>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>
          <div className="flex-1">
            <AlertsCard alerts={alerts} />
          </div>
        </div>
      </div>

      {/* Row 2: 配額 + 社群 ↔ 問卷議題對齊 */}
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <QuotaPanel />
        <TopicAlignmentCard />
      </div>

      {/* Row 3: 最近社群討論（全寬） */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Radio className="h-4 w-4 text-muted-foreground" />
            最近社群討論
          </CardTitle>
          <div className="flex items-center gap-3">
            <Button onClick={runAnalyze} disabled={analyzing} size="sm" variant="outline" className="h-7 text-xs">
              {analyzing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
              AI 分析
            </Button>
            <Link href="/social" className="text-xs text-primary hover:underline font-medium">
              查看全部
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-1 mb-4 border-b">
            {categoryTabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setCategoryFilter(tab.key)}
                className={cn(
                  'px-3 py-2 text-sm transition-colors relative',
                  categoryFilter === tab.key
                    ? 'font-semibold text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {tab.label}
                <span className="text-xs ml-1 text-muted-foreground">({tab.count})</span>
                {categoryFilter === tab.key && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
                )}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 mb-5 border rounded-md p-2 bg-muted/20">
            <div className="flex flex-col">
              <div className="flex items-center justify-between px-2 pt-1 pb-0.5">
                <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">正向詞</span>
                <span className="text-[10px] text-muted-foreground/70">{cloudData.positive.length}</span>
              </div>
              <WordCloud words={cloudData.positive} tone="positive" emptyLabel="尚未分析，點擊右上「AI 分析」" />
            </div>
            <div className="flex flex-col border-l">
              <div className="flex items-center justify-between px-2 pt-1 pb-0.5">
                <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">負向詞</span>
                <span className="text-[10px] text-muted-foreground/70">{cloudData.negative.length}</span>
              </div>
              <WordCloud words={cloudData.negative} tone="negative" emptyLabel="　" />
            </div>
          </div>
          {(analyzeMsg || analyzedAt) && (
            <div className="text-[11px] text-muted-foreground mb-3 -mt-2 px-1">
              {analyzeMsg && <span>{analyzeMsg}</span>}
              {analyzedAt && <span className="ml-2">· 分析於 {new Date(analyzedAt).toLocaleString('zh-TW')}</span>}
            </div>
          )}

          <div className="divide-y">
            {filteredPosts.slice(0, 10).map((post) => (
              <a
                key={post.id}
                href={post.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 py-3 first:pt-0 last:pb-0 hover:bg-accent/30 -mx-2 px-2 rounded-lg transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium line-clamp-1">{post.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{post.description}</p>
                  <div className="flex gap-1.5 mt-2 items-center flex-wrap">
                    <Badge variant="outline" className="text-[11px] py-0">{post.platform}</Badge>
                    {post.sentiment && (
                      <span className={`text-[11px] px-1.5 py-0 rounded ${sentimentColor[post.sentiment]}`}>
                        {sentimentLabel[post.sentiment]}
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-xs text-muted-foreground shrink-0 mt-0.5">{timeAgo(post.published_at)}</span>
              </a>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/* ----------- Subcomponents ----------- */

function AISearchHero({ prompts }: { prompts: string[] }) {
  const router = useRouter()
  const [q, setQ] = useState('')

  function submit(value?: string) {
    const text = (value ?? q).trim()
    if (!text) return
    router.push(`/ask?q=${encodeURIComponent(text)}`)
  }

  return (
    <div className="rounded-xl border bg-gradient-to-br from-primary/5 via-background to-background p-5">
      <div className="flex items-center gap-3 mb-3">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">AI 跨來源問答</span>
        <span className="text-xs text-muted-foreground">整合社群、訪談、問卷</span>
      </div>
      <form
        onSubmit={(e) => { e.preventDefault(); submit() }}
        className="flex items-center gap-2"
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="想知道什麼？例如：本月計程車最常被抱怨的問題？"
            className="pl-9 h-10 text-sm"
          />
        </div>
        <Button type="submit" disabled={!q.trim()} size="default" className="h-10 px-4">
          提問
          <ArrowRight className="h-3.5 w-3.5 ml-1" />
        </Button>
      </form>
      <div className="flex items-center gap-2 flex-wrap mt-3">
        <span className="text-[11px] text-muted-foreground">熱門：</span>
        {prompts.slice(0, 4).map((p, i) => (
          <button
            key={i}
            type="button"
            onClick={() => submit(p)}
            className="text-xs px-2.5 py-1 rounded-full border bg-background hover:bg-accent hover:border-primary/40 text-muted-foreground hover:text-foreground transition-colors"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  )
}

function AlertsCard({ alerts }: { alerts: PrAlert[] }) {
  const critical = alerts.filter(a => a.level === 'critical').length
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
  const styles: Record<AlertLevel, { bar: string; icon: string; badge: string; label: string }> = {
    critical: {
      bar: 'border-l-red-500 bg-red-50/40 dark:bg-red-950/20',
      icon: 'text-red-600 dark:text-red-400',
      badge: 'border-red-500/40 text-red-600 dark:text-red-400',
      label: '高風險',
    },
    warning: {
      bar: 'border-l-amber-500 bg-amber-50/40 dark:bg-amber-950/20',
      icon: 'text-amber-600 dark:text-amber-400',
      badge: 'border-amber-500/40 text-amber-600 dark:text-amber-400',
      label: '注意',
    },
    info: {
      bar: 'border-l-blue-500 bg-blue-50/40 dark:bg-blue-950/20',
      icon: 'text-blue-600 dark:text-blue-400',
      badge: 'border-blue-500/40 text-blue-600 dark:text-blue-400',
      label: '資訊',
    },
  }
  const s = styles[alert.level]
  return (
    <div className={cn('border-l-2 rounded-r-sm px-3 py-2', s.bar)}>
      <div className="flex items-start gap-2">
        <AlertTriangle className={cn('h-3.5 w-3.5 mt-0.5 shrink-0', s.icon)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="outline" className={cn('text-[10px] py-0', s.badge)}>
              {s.label}
            </Badge>
            <Badge variant="secondary" className="text-[10px] py-0">
              {alert.category}
            </Badge>
            <span className="text-[10px] text-muted-foreground">{alert.source}</span>
          </div>
          <p className="text-sm font-medium mt-1 line-clamp-1">{alert.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{alert.detail}</p>
          <div className="text-[10px] text-muted-foreground/80 mt-1">
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

