'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Sparkles, Loader2, RefreshCw, AlertTriangle, TrendingUp, Info } from 'lucide-react'
import type { DashboardInsight, DashboardInsightsSnapshot } from '@/lib/dashboard-insights-store'
import { useElapsed } from '@/lib/useElapsed'

const toneStyles: Record<DashboardInsight['tone'], { icon: React.ComponentType<{ className?: string }>; iconCls: string }> = {
  positive: {
    icon: TrendingUp,
    iconCls: 'text-emerald-600 dark:text-emerald-400',
  },
  warning: {
    icon: AlertTriangle,
    iconCls: 'text-amber-600 dark:text-amber-400',
  },
  info: {
    icon: Info,
    iconCls: 'text-muted-foreground',
  },
}

const sourceLabel: Record<DashboardInsight['source'], string> = {
  survey: '問卷',
  social: '社群',
  alert: '事件',
  mixed: '綜合',
}

export function InsightsOverview() {
  const [snapshot, setSnapshot] = useState<DashboardInsightsSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const elapsed = useElapsed(running)

  useEffect(() => {
    fetch('/api/insights/overview')
      .then(r => r.json())
      .then(d => setSnapshot(d.snapshot ?? null))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function regenerate() {
    setRunning(true)
    setError(null)
    try {
      const res = await fetch('/api/insights/overview', { method: 'POST' })
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
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3">
        <div className="min-w-0">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            最新洞察總覽
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            整合月度問卷 + 社群討論，AI 摘要 Top 5
            {snapshot?.generatedAt && (
              <span className="ml-1.5">
                ・ {new Date(snapshot.generatedAt).toLocaleString('zh-TW')}
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
            <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Pro 深度分析中{elapsed > 0 ? ` (${elapsed}s)` : ''}</>
          ) : snapshot ? (
            <><RefreshCw className="h-3.5 w-3.5 mr-1.5" />重新分析</>
          ) : (
            <><Sparkles className="h-3.5 w-3.5 mr-1.5" />產生洞察</>
          )}
        </Button>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        {error && <p className="text-xs text-destructive mb-3">{error}</p>}
        {running && (
          <p className="text-xs text-muted-foreground mb-3">
            Gemini 2.5 Pro 正在綜合問卷 + 社群資料生成洞察，預計 10–30 秒。
          </p>
        )}
        {loading ? (
          <p className="text-xs text-muted-foreground text-center flex-1 flex items-center justify-center">載入中...</p>
        ) : !snapshot ? (
          <p className="text-xs text-muted-foreground text-center flex-1 flex items-center justify-center px-4">
            尚未產生洞察，點右上「產生洞察」啟動（耗 1 份 Gemini 配額）
          </p>
        ) : snapshot.insights.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center flex-1 flex items-center justify-center">無洞察</p>
        ) : (
          <div className="space-y-2.5">
            {snapshot.insights.map((it, i) => {
              const style = toneStyles[it.tone]
              const Icon = style.icon
              return (
                <div key={i} className="rounded-md border px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${style.iconCls}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap mb-1">
                        <span className="text-sm font-semibold">{it.title}</span>
                        <Badge variant="secondary" className="text-[10px] py-0">
                          {sourceLabel[it.source]}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{it.body}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
