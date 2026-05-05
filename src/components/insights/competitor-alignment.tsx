'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Sparkles, Loader2, RefreshCw, Swords, AlertTriangle } from 'lucide-react'
import type { CompetitorAlignmentSnapshot } from '@/lib/competitor-alignment-store'

export function CompetitorAlignmentCard() {
  const [snapshot, setSnapshot] = useState<CompetitorAlignmentSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [quota, setQuota] = useState<{ firecrawl: { remaining: number; limit: number }; chat: { remaining: number; limit: number } } | null>(null)

  useEffect(() => {
    fetch('/api/insights/competitor-alignment')
      .then(r => r.json())
      .then(d => {
        setSnapshot(d.snapshot ?? null)
        setQuota(d.quota ?? null)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function regenerate() {
    if (!confirm('將消耗 3 firecrawl + 1 chat 配額，確認嗎？')) return
    setRunning(true)
    setError(null)
    try {
      const res = await fetch('/api/insights/competitor-alignment', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? '產生失敗')
      } else {
        setSnapshot(data.snapshot)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between flex-wrap gap-2 pb-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Swords className="h-4 w-4 text-primary" />
            競品對標：Uber / Yoxi / 55688
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            把自家問卷負向議題 vs 競品社群討論做對齊；找共同議題、行業弱點、自家獨有問題
            {snapshot && (
              <span className="ml-1.5">・ {new Date(snapshot.generatedAt).toLocaleString('zh-TW')}</span>
            )}
            {quota && (
              <span className="ml-1.5">・ Firecrawl 餘 {quota.firecrawl.remaining}/{quota.firecrawl.limit}</span>
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
            <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />分析中</>
          ) : snapshot ? (
            <><RefreshCw className="h-3.5 w-3.5 mr-1.5" />重新分析</>
          ) : (
            <><Sparkles className="h-3.5 w-3.5 mr-1.5" />產生對標</>
          )}
        </Button>
      </CardHeader>
      <CardContent>
        {error && <p className="text-xs text-destructive mb-3">{error}</p>}
        {loading ? (
          <p className="text-xs text-muted-foreground text-center py-6">載入中...</p>
        ) : !snapshot ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            尚未產生對標，點右上「產生對標」啟動（消耗 3 firecrawl + 1 chat）
          </p>
        ) : (
          <div className="space-y-4">
            {snapshot.summary && (
              <div className="border-l-2 border-primary/40 bg-accent/20 rounded-r px-3 py-2">
                <p className="text-sm">{snapshot.summary}</p>
              </div>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
              <SentimentBlock label="LINE GO 問卷" counts={snapshot.ourCounts} />
              {snapshot.competitors.map(c => (
                <SentimentBlock key={c} label={c} counts={snapshot.countsByCompetitor[c]} />
              ))}
            </div>

            <div className="grid lg:grid-cols-3 gap-3">
              <Column
                title="共同議題"
                count={snapshot.sharedIssues.length}
                tone="emerald"
                empty="無共同議題"
              >
                {snapshot.sharedIssues.map((it, i) => (
                  <div key={i} className="border rounded-md p-2.5 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-1">
                    <div className="text-sm font-medium">{it.topic}</div>
                    <div className="text-[11px] text-muted-foreground">
                      <span className="font-medium text-foreground">自家：</span>{it.ours}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      <span className="font-medium text-foreground">競品：</span>{it.competitor}
                    </div>
                  </div>
                ))}
              </Column>

              <Column
                title="只在競品（行業弱點）"
                count={snapshot.competitorOnly.length}
                tone="amber"
                empty="競品端無獨有議題"
              >
                {snapshot.competitorOnly.map((it, i) => (
                  <div key={i} className="border rounded-md p-2.5 bg-amber-50/40 dark:bg-amber-950/20 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium">{it.topic}</div>
                      {it.competitor && <Badge variant="secondary" className="text-[10px] shrink-0">{it.competitor}</Badge>}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{it.evidence}</div>
                  </div>
                ))}
              </Column>

              <Column
                title="只在自家（需主動修）"
                count={snapshot.ourOnly.length}
                tone="rose"
                empty="自家無獨有議題"
              >
                {snapshot.ourOnly.map((it, i) => (
                  <div key={i} className="border rounded-md p-2.5 bg-rose-50/40 dark:bg-rose-950/20 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle className="h-3 w-3 text-rose-600 shrink-0" />
                      <div className="text-sm font-medium">{it.topic}</div>
                    </div>
                    <div className="text-[11px] text-muted-foreground">{it.evidence}</div>
                  </div>
                ))}
              </Column>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function SentimentBlock({ label, counts }: { label: string; counts: { positive: number; negative: number; neutral: number; total: number } | undefined }) {
  if (!counts || counts.total === 0) {
    return (
      <div className="border rounded-md p-2.5">
        <div className="text-[11px] text-muted-foreground">{label}</div>
        <div className="text-xs mt-1">無資料</div>
      </div>
    )
  }
  const negPct = (counts.negative / counts.total * 100).toFixed(1)
  return (
    <div className="border rounded-md p-2.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="flex items-baseline gap-1 mt-0.5">
        <span className="text-lg font-bold tabular-nums text-rose-600">{negPct}%</span>
        <span className="text-[10px] text-muted-foreground">負向</span>
      </div>
      <div className="text-[10px] text-muted-foreground mt-0.5">
        +{counts.positive} / -{counts.negative} / {counts.total} 總
      </div>
    </div>
  )
}

function Column({
  title,
  count,
  empty,
  children,
}: {
  title: string
  count: number
  tone: string
  empty: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold">{title}</span>
        <Badge variant="secondary" className="text-[10px]">{count}</Badge>
      </div>
      {count === 0 ? (
        <p className="text-[11px] text-muted-foreground italic">{empty}</p>
      ) : (
        <div className="space-y-2">{children}</div>
      )}
    </div>
  )
}
