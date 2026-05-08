'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Sparkles, Loader2, RefreshCw, TrendingUp, TrendingDown, Minus, GitMerge, ChevronDown, ChevronRight } from 'lucide-react'
import type {
  CanonicalIssue,
  IssueTrend,
  IssueTrendsSnapshot,
} from '@/lib/issue-trends-store'
import { useElapsed } from '@/lib/useElapsed'

const trendStyle: Record<IssueTrend, { icon: React.ComponentType<{ className?: string }>; cls: string; label: string }> = {
  rising: { icon: TrendingUp, cls: 'text-rose-600 dark:text-rose-400', label: '上升中' },
  falling: { icon: TrendingDown, cls: 'text-emerald-600 dark:text-emerald-400', label: '下降中' },
  stable: { icon: Minus, cls: 'text-slate-500', label: '持平' },
  single: { icon: Minus, cls: 'text-slate-400', label: '僅一期' },
}

const TREND_ORDER: IssueTrend[] = ['rising', 'stable', 'falling', 'single']

export function IssueTrendsCard() {
  const [snapshot, setSnapshot] = useState<IssueTrendsSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const elapsed = useElapsed(running)

  useEffect(() => {
    fetch('/api/surveys/issue-trends')
      .then(r => r.json())
      .then(d => setSnapshot(d.snapshot ?? null))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function regenerate() {
    setRunning(true)
    setError(null)
    try {
      const res = await fetch('/api/surveys/issue-trends', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? '產生失敗')
      } else {
        setSnapshot(data.snapshot)
        setExpanded(new Set())
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setRunning(false)
    }
  }

  function toggleExpand(idx: number) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  const sortedIssues = useMemo(() => {
    if (!snapshot) return []
    return [...snapshot.issues]
      .map((iss, i) => ({ iss, i }))
      .sort((a, b) => {
        const ord = TREND_ORDER.indexOf(a.iss.trend) - TREND_ORDER.indexOf(b.iss.trend)
        if (ord !== 0) return ord
        return b.iss.occurrences.length - a.iss.occurrences.length
      })
  }, [snapshot])

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between flex-wrap gap-2 pb-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <GitMerge className="h-4 w-4 text-primary" />
            跨問卷議題趨勢
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            把 Q1 / Q2 / 月度問卷的主題 canonicalize 成統一座標，看哪個議題在升 / 降
            {snapshot && (
              <span className="ml-1.5">
                ・ {new Date(snapshot.generatedAt).toLocaleString('zh-TW')}
                ・ 涵蓋 {snapshot.periods.length} 個時段
                ・ 來源 {snapshot.totalRawThemes} 筆
              </span>
            )}
          </p>
        </div>
        <Button
          size="sm"
          variant={snapshot ? 'outline' : 'default'}
          onClick={regenerate}
          disabled={running}
        >
          {running ? (
            <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Pro 對齊中{elapsed > 0 ? ` (${elapsed}s)` : ''}</>
          ) : snapshot ? (
            <><RefreshCw className="h-3.5 w-3.5 mr-1.5" />重新分析</>
          ) : (
            <><Sparkles className="h-3.5 w-3.5 mr-1.5" />產生議題趨勢</>
          )}
        </Button>
      </CardHeader>
      <CardContent>
        {error && <p className="text-xs text-destructive mb-3">{error}</p>}
        {running && (
          <p className="text-xs text-muted-foreground mb-3">
            Gemini 2.5 Pro 正在合併同義議題並判斷時間趨勢，預計 15–30 秒。
          </p>
        )}
        {loading ? (
          <p className="text-xs text-muted-foreground text-center py-6">載入中...</p>
        ) : !snapshot ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            尚未產生議題趨勢，點右上「產生議題趨勢」啟動（耗 1 份 Pro 配額）
          </p>
        ) : (
          <div className="space-y-3">
            {snapshot.summary && (
              <div className="border-l-2 border-primary/40 bg-accent/20 rounded-r px-3 py-2">
                <p className="text-sm whitespace-pre-line">{snapshot.summary}</p>
              </div>
            )}

            <div className="border rounded-md divide-y">
              {sortedIssues.map(({ iss, i }) => {
                const T = trendStyle[iss.trend]
                const isOpen = expanded.has(i)
                return (
                  <div key={i} className="px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => toggleExpand(i)}
                      className="w-full flex items-center gap-3 text-left hover:bg-accent/30 -mx-3 px-3 py-1 rounded transition-colors"
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{iss.title}</span>
                          <Badge variant="outline" className="text-[10px]">{iss.kind}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {iss.occurrences.length} 次出現 · 跨 {new Set(iss.occurrences.map(o => o.period)).size} 期
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
                        {iss.rationale && (
                          <p className="text-xs text-muted-foreground italic">
                            判斷依據：{iss.rationale}
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
        )}
      </CardContent>
    </Card>
  )
}
