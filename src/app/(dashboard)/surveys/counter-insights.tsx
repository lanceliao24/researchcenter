'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Loader2,
  RefreshCw,
  Sparkles,
  Split,
  ThumbsUp,
  ThumbsDown,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import type { Contradiction, CounterInsightsSnapshot, ServiceCounterInsights } from '@/lib/counter-insights-store'
import { useElapsed } from '@/lib/useElapsed'

function ContradictionRow({ c }: { c: Contradiction }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border rounded-md">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent/30 transition-colors"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
        <span className="text-sm font-medium flex-1">{c.topic}</span>
        <Split className="h-4 w-4 text-amber-600 shrink-0" />
      </button>
      <div className="px-3 pb-2 grid grid-cols-2 gap-2 text-xs">
        <div className="border-l-2 border-emerald-500 pl-2 py-1 bg-emerald-50/30 dark:bg-emerald-950/20 rounded-r">
          <div className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium mb-0.5">
            <ThumbsUp className="h-3 w-3" /> Promoter 觀感
          </div>
          <p className="text-foreground">{c.promoter_view}</p>
        </div>
        <div className="border-l-2 border-rose-500 pl-2 py-1 bg-rose-50/30 dark:bg-rose-950/20 rounded-r">
          <div className="flex items-center gap-1 text-rose-700 dark:text-rose-400 font-medium mb-0.5">
            <ThumbsDown className="h-3 w-3" /> Detractor 觀感
          </div>
          <p className="text-foreground">{c.detractor_view}</p>
        </div>
      </div>
      {c.scenario_hypothesis && (
        <div className="px-3 pb-2">
          <div className="border-l-2 border-primary/40 bg-accent/20 rounded-r px-2 py-1.5">
            <p className="text-xs">
              <span className="font-medium text-foreground">場景假設：</span>
              <span className="text-muted-foreground">{c.scenario_hypothesis}</span>
            </p>
          </div>
        </div>
      )}
      {open && (
        <div className="px-3 pb-3 space-y-2">
          {c.promoter_evidence.length > 0 && (
            <div>
              <div className="text-[10px] font-medium text-emerald-700 dark:text-emerald-400 mb-1">
                Promoter 原文（{c.promoter_evidence.length} 則）
              </div>
              <ul className="space-y-1">
                {c.promoter_evidence.map((q, i) => (
                  <li key={i} className="text-[11px] text-muted-foreground border-l-2 border-emerald-200 dark:border-emerald-900 pl-2">
                    {q}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {c.detractor_evidence.length > 0 && (
            <div>
              <div className="text-[10px] font-medium text-rose-700 dark:text-rose-400 mb-1">
                Detractor 原文（{c.detractor_evidence.length} 則）
              </div>
              <ul className="space-y-1">
                {c.detractor_evidence.map((q, i) => (
                  <li key={i} className="text-[11px] text-muted-foreground border-l-2 border-rose-200 dark:border-rose-900 pl-2">
                    {q}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ServiceCounterSection({
  data,
  onRegenerate,
  regenerating,
}: {
  data: ServiceCounterInsights
  onRegenerate: (service: string) => void
  regenerating: boolean
}) {
  return (
    <div className="border rounded-lg">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30 gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{data.serviceLabel}</span>
          <Badge variant="outline" className="text-[10px]">{data.service}</Badge>
          <span className="text-xs text-muted-foreground">
            {data.month} ・ Promoter {data.promoterCount} / Detractor {data.detractorCount}
          </span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={() => onRegenerate(data.service)}
          disabled={regenerating}
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          只重跑這個
        </Button>
      </div>

      {data.summary && (
        <div className="border-l-2 border-primary/40 bg-accent/20 m-3 rounded-r px-3 py-2">
          <p className="text-sm whitespace-pre-line">{data.summary}</p>
        </div>
      )}

      {data.contradictions.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4 px-3">
          AI 沒找到明確的矛盾議題
        </p>
      ) : (
        <div className="p-3 space-y-2">
          {data.contradictions.map((c, i) => (
            <ContradictionRow key={i} c={c} />
          ))}
        </div>
      )}
    </div>
  )
}

export function CounterInsightsCard() {
  const [snapshot, setSnapshot] = useState<CounterInsightsSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState<'all' | string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [skippedServices, setSkippedServices] = useState<string[]>([])
  const elapsed = useElapsed(running !== null)

  useEffect(() => {
    fetch('/api/surveys/counter-insights')
      .then(r => r.json())
      .then(d => setSnapshot(d.snapshot ?? null))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function regenerate(service?: string) {
    setRunning(service ?? 'all')
    setError(null)
    try {
      const res = await fetch('/api/surveys/counter-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(service ? { service } : {}),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? '產生失敗')
      } else {
        setSnapshot(data.snapshot)
        setSkippedServices(Array.isArray(data.skippedServices) ? data.skippedServices : [])
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setRunning(null)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between flex-wrap gap-2 pb-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Split className="h-4 w-4 text-amber-600" />
            Promoter ↔ Detractor 矛盾
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            找同一服務裡，NPS 9-10 與 NPS 0-6 對相同主題有相反看法的議題 — 通常是場景化問題的線索
            {snapshot && (
              <span className="ml-1.5">
                ・ {new Date(snapshot.generatedAt).toLocaleString('zh-TW')}
                ・ {snapshot.byService.length} 個服務
              </span>
            )}
          </p>
        </div>
        <Button
          size="sm"
          variant={snapshot ? 'outline' : 'default'}
          onClick={() => regenerate()}
          disabled={running !== null}
        >
          {running === 'all' ? (
            <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Pro 分析中{elapsed > 0 ? ` (${elapsed}s)` : ''}</>
          ) : snapshot ? (
            <><RefreshCw className="h-3.5 w-3.5 mr-1.5" />全部重新分析</>
          ) : (
            <><Sparkles className="h-3.5 w-3.5 mr-1.5" />產生矛盾分析</>
          )}
        </Button>
      </CardHeader>
      <CardContent>
        {error && <p className="text-xs text-destructive mb-3">{error}</p>}
        {running === 'all' && (
          <p className="text-xs text-muted-foreground mb-3">
            Gemini 2.5 Pro 對每個 eligible 服務分別找矛盾（每服務 ~30-60 秒、耗 1 份 Pro 配額）。
          </p>
        )}
        {skippedServices.length > 0 && (
          <p className="text-[11px] text-muted-foreground mb-3">
            ⓘ 跳過樣本不足的服務（promoter 或 detractor &lt; 5）：{skippedServices.join('、')}
          </p>
        )}
        {loading ? (
          <p className="text-xs text-muted-foreground text-center py-6">載入中...</p>
        ) : !snapshot || snapshot.byService.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            尚未分析，點右上「產生矛盾分析」啟動（每服務 1 份 Pro 配額）
          </p>
        ) : (
          <div className="space-y-4">
            {snapshot.byService.map(s => (
              <ServiceCounterSection
                key={s.service}
                data={s}
                onRegenerate={regenerate}
                regenerating={running === s.service || running === 'all'}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
