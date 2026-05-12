'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Sparkles,
  Loader2,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  GitMerge,
  ChevronDown,
  ChevronRight,
  AlertOctagon,
  Search,
  Eye,
  PauseCircle,
} from 'lucide-react'
import type {
  CanonicalIssue,
  IssueAction,
  IssueConfidence,
  IssueImpact,
  IssueTrend,
  IssueTrendsSnapshot,
  ServiceTrends,
} from '@/lib/issue-trends-store'
import { useElapsed } from '@/lib/useElapsed'

const trendStyle: Record<
  IssueTrend,
  { icon: React.ComponentType<{ className?: string }>; cls: string; label: string }
> = {
  rising: { icon: TrendingUp, cls: 'text-rose-600 dark:text-rose-400', label: '上升中' },
  falling: { icon: TrendingDown, cls: 'text-emerald-600 dark:text-emerald-400', label: '下降中' },
  stable: { icon: Minus, cls: 'text-slate-500', label: '持平' },
  single: { icon: Minus, cls: 'text-slate-400', label: '僅一期' },
}

const impactStyle: Record<IssueImpact, { cls: string; label: string }> = {
  high: { cls: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border-rose-500/40', label: '高影響' },
  medium: { cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-amber-500/40', label: '中影響' },
  low: { cls: 'bg-slate-100 text-slate-600 dark:bg-slate-900/40 dark:text-slate-400 border-slate-400/40', label: '低影響' },
}

const confidenceStyle: Record<IssueConfidence, { cls: string; label: string }> = {
  high: { cls: 'text-emerald-700 dark:text-emerald-400', label: '信心高' },
  medium: { cls: 'text-slate-600 dark:text-slate-400', label: '信心中' },
  low: { cls: 'text-slate-400 dark:text-slate-500', label: '信心低' },
}

const actionStyle: Record<IssueAction, { icon: React.ComponentType<{ className?: string }>; cls: string; label: string }> = {
  prioritize: { icon: AlertOctagon, cls: 'bg-rose-600 text-white border-rose-600', label: '優先處理' },
  investigate: { icon: Search, cls: 'bg-amber-500 text-white border-amber-500', label: '深入研究' },
  monitor: { icon: Eye, cls: 'bg-sky-500 text-white border-sky-500', label: '持續觀察' },
  defer: { icon: PauseCircle, cls: 'bg-slate-400 text-white border-slate-400', label: '暫不處理' },
}

const ACTION_ORDER: IssueAction[] = ['prioritize', 'investigate', 'monitor', 'defer']
const CONFIDENCE_ORDER: IssueConfidence[] = ['high', 'medium', 'low']
const TREND_ORDER: IssueTrend[] = ['rising', 'stable', 'falling', 'single']

function sortIssues(issues: CanonicalIssue[]) {
  return [...issues].map((iss, i) => ({ iss, i })).sort((a, b) => {
    // 1. Recommended action (prioritize > investigate > monitor > defer; undefined last)
    const aAct = a.iss.recommended_action ? ACTION_ORDER.indexOf(a.iss.recommended_action) : 99
    const bAct = b.iss.recommended_action ? ACTION_ORDER.indexOf(b.iss.recommended_action) : 99
    if (aAct !== bAct) return aAct - bAct
    // 2. Confidence (high > medium > low; undefined last)
    const aConf = a.iss.confidence ? CONFIDENCE_ORDER.indexOf(a.iss.confidence) : 99
    const bConf = b.iss.confidence ? CONFIDENCE_ORDER.indexOf(b.iss.confidence) : 99
    if (aConf !== bConf) return aConf - bConf
    // 3. Trend (rising surfaces first)
    const ord = TREND_ORDER.indexOf(a.iss.trend) - TREND_ORDER.indexOf(b.iss.trend)
    if (ord !== 0) return ord
    return b.iss.occurrences.length - a.iss.occurrences.length
  })
}

function ServiceSection({
  trends,
  onRegenerate,
  regenerating,
}: {
  trends: ServiceTrends
  onRegenerate: (service: string) => void
  regenerating: boolean
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const sorted = useMemo(() => sortIssues(trends.issues), [trends.issues])

  function toggle(i: number) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  return (
    <div className="border rounded-lg">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30 flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{trends.serviceLabel}</span>
          <Badge variant="outline" className="text-[10px]">{trends.service}</Badge>
          <span className="text-xs text-muted-foreground">
            {trends.issues.length} 議題 · {trends.rawCount} 筆 raw · 跨 {trends.periods.length} 期 ({trends.periods.join(' → ')})
          </span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={() => onRegenerate(trends.service)}
          disabled={regenerating}
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          只重跑這個
        </Button>
      </div>

      {trends.summary && (
        <div className="border-l-2 border-primary/40 bg-accent/20 m-3 rounded-r px-3 py-2">
          <p className="text-sm whitespace-pre-line">{trends.summary}</p>
        </div>
      )}

      <div className="divide-y">
        {sorted.map(({ iss, i }) => {
          const T = trendStyle[iss.trend]
          const isOpen = expanded.has(i)
          const A = iss.recommended_action ? actionStyle[iss.recommended_action] : null
          const Imp = iss.impact ? impactStyle[iss.impact] : null
          const Conf = iss.confidence ? confidenceStyle[iss.confidence] : null
          return (
            <div key={i} className="px-3 py-2">
              <button
                type="button"
                onClick={() => toggle(i)}
                className="w-full flex items-center gap-3 text-left hover:bg-accent/30 -mx-3 px-3 py-1 rounded transition-colors"
              >
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                {A && (
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-medium shrink-0 ${A.cls}`}>
                    <A.icon className="h-3 w-3" />
                    {A.label}
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{iss.title}</span>
                    {Imp && (
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${Imp.cls}`}>
                        {Imp.label}
                      </span>
                    )}
                    {Conf && (
                      <span className={`text-[10px] font-medium ${Conf.cls}`}>
                        {Conf.label}
                      </span>
                    )}
                    <Badge variant="outline" className="text-[10px]">{iss.kind}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {iss.occurrences.length} 次 · 跨 {new Set(iss.occurrences.map(o => o.period)).size} 期
                    </span>
                  </div>
                  {iss.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{iss.description}</p>
                  )}
                </div>
                <div className={`flex items-center gap-1 shrink-0 ${T.cls}`}>
                  <T.icon className="h-4 w-4" />
                  <span className="text-xs font-medium">{T.label}</span>
                </div>
              </button>

              {isOpen && (
                <div className="mt-3 ml-7 space-y-2">
                  {iss.action_rationale && (
                    <p className="text-xs">
                      <span className="font-medium text-foreground">建議理由：</span>
                      <span className="text-muted-foreground">{iss.action_rationale}</span>
                    </p>
                  )}
                  {iss.rationale && (
                    <p className="text-xs text-muted-foreground italic">
                      趨勢判斷：{iss.rationale}
                    </p>
                  )}
                  <div className="space-y-1.5">
                    {iss.occurrences.map((occ, j) => (
                      <div key={j} className="text-xs border-l-2 border-muted pl-2 py-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="secondary" className="text-[10px] tabular-nums">{occ.period}</Badge>
                          <span className="text-muted-foreground">{occ.source}</span>
                          {occ.count !== undefined && (
                            <span className="text-muted-foreground">· {occ.count} 筆</span>
                          )}
                          {occ.frequency && (
                            <span className="text-muted-foreground">· {occ.frequency}</span>
                          )}
                        </div>
                        <div className="mt-0.5">
                          <span className="text-foreground">{occ.rawLabel}</span>
                          {occ.evidence && (
                            <span className="text-muted-foreground"> — {occ.evidence.slice(0, 120)}{occ.evidence.length > 120 ? '...' : ''}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface AvailableSource {
  id: string
  kind: 'quarterly' | 'monthly'
  label: string
  themeCount: number
}

export function IssueTrendsCard({ serviceFilter }: { serviceFilter?: string } = {}) {
  const [snapshot, setSnapshot] = useState<IssueTrendsSnapshot | null>(null)
  const [sources, setSources] = useState<AvailableSource[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState<'all' | string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const elapsed = useElapsed(running !== null)

  useEffect(() => {
    fetch('/api/surveys/issue-trends')
      .then(r => r.json())
      .then(d => {
        if (d.snapshot && Array.isArray(d.snapshot.byService)) {
          setSnapshot(d.snapshot)
        } else {
          setSnapshot(null)
        }
        const src: AvailableSource[] = Array.isArray(d.sources) ? d.sources : []
        setSources(src)
        // default: all selected
        setSelected(new Set(src.map(s => s.id)))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function toggleSource(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected(prev => prev.size === sources.length ? new Set() : new Set(sources.map(s => s.id)))
  }

  async function regenerate(service?: string) {
    setRunning(service ?? 'all')
    setError(null)
    try {
      const body: { service?: string; sources?: string[] } = service ? { service } : {}
      // Only send sources filter if user has deselected anything (otherwise let API default).
      if (selected.size < sources.length) {
        body.sources = Array.from(selected)
      }
      const res = await fetch('/api/surveys/issue-trends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? '產生失敗')
      } else {
        setSnapshot(data.snapshot)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setRunning(null)
    }
  }

  const allSelected = sources.length > 0 && selected.size === sources.length
  const selectedThemes = sources
    .filter(s => selected.has(s.id))
    .reduce((sum, s) => sum + s.themeCount, 0)

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between flex-wrap gap-2 pb-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <GitMerge className="h-4 w-4 text-primary" />
            跨問卷議題趨勢（按服務分）
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            把同一服務（計程車 / 租車 / 共享機車...）跨季度跨月份的主題對齊，看哪個議題在升 / 降
            {snapshot && (
              <span className="ml-1.5">
                ・ {new Date(snapshot.generatedAt).toLocaleString('zh-TW')}
                ・ 來源 {snapshot.totalRawThemes} 筆
                ・ {snapshot.byService.length} 個服務
              </span>
            )}
          </p>
        </div>
        <Button
          size="sm"
          variant={snapshot ? 'outline' : 'default'}
          onClick={() => regenerate()}
          disabled={running !== null || selected.size === 0}
        >
          {running === 'all' ? (
            <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Pro 對齊中{elapsed > 0 ? ` (${elapsed}s)` : ''}</>
          ) : snapshot ? (
            <><RefreshCw className="h-3.5 w-3.5 mr-1.5" />重新對齊（{selected.size} 份）</>
          ) : (
            <><Sparkles className="h-3.5 w-3.5 mr-1.5" />產生議題趨勢</>
          )}
        </Button>
      </CardHeader>
      <CardContent>
        {error && <p className="text-xs text-destructive mb-3">{error}</p>}

        {sources.length > 0 && (
          <div className="mb-4 border rounded-md bg-muted/20 p-3">
            <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
              <span className="text-xs font-medium">
                納入分析的問卷（{selected.size}/{sources.length}，共 {selectedThemes} 筆主題）
              </span>
              <button
                type="button"
                onClick={toggleAll}
                className="text-[11px] text-primary hover:underline"
                disabled={running !== null}
              >
                {allSelected ? '全部取消' : '全部勾選'}
              </button>
            </div>
            <div className="space-y-1">
              {sources.map(src => {
                const isChecked = selected.has(src.id)
                return (
                  <label
                    key={src.id}
                    className={`flex items-center gap-2 px-2 py-1 rounded text-xs cursor-pointer transition-colors ${
                      isChecked ? 'bg-accent/30' : 'hover:bg-accent/20'
                    } ${running !== null ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleSource(src.id)}
                      disabled={running !== null}
                      className="h-3.5 w-3.5 cursor-pointer"
                    />
                    <Badge variant="outline" className="text-[10px]">
                      {src.kind === 'quarterly' ? '季度' : '月度'}
                    </Badge>
                    <span className="flex-1">{src.label}</span>
                    <span className="text-muted-foreground tabular-nums">{src.themeCount} 主題</span>
                  </label>
                )
              })}
            </div>
            {selected.size === 0 && (
              <p className="text-[11px] text-amber-600 mt-2">至少要勾一份問卷才能對齊</p>
            )}
          </div>
        )}

        {running === 'all' && (
          <p className="text-xs text-muted-foreground mb-3">
            Gemini 2.5 Pro 對每個服務分別對齊（每服務 ~60-90 秒，會耗每服務 1 份 Pro 配額）。
          </p>
        )}
        {loading ? (
          <p className="text-xs text-muted-foreground text-center py-6">載入中...</p>
        ) : !snapshot ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            尚未產生議題趨勢，點右上「產生議題趨勢」啟動（每服務耗 1 份 Pro 配額）
          </p>
        ) : (
          <div className="space-y-4">
            {snapshot.byService
              .filter(s => !serviceFilter || s.service === serviceFilter)
              .map(s => (
                <ServiceSection
                  key={s.service}
                  trends={s}
                  onRegenerate={regenerate}
                  regenerating={running === s.service || running === 'all'}
                />
              ))}
            {serviceFilter && snapshot.byService.every(s => s.service !== serviceFilter) && (
              <p className="text-xs text-muted-foreground text-center py-6">
                此服務尚無議題趨勢分析
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
