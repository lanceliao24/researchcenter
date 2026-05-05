'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FileText, Sparkles, Loader2, RefreshCw, AlertTriangle, TrendingUp, Info, Lightbulb } from 'lucide-react'
import type { MonthlyReportSnapshot, ReportFinding } from '@/lib/monthly-report-store'

const toneStyles: Record<ReportFinding['tone'], { bar: string; icon: React.ComponentType<{ className?: string }>; iconCls: string; badgeCls: string; label: string }> = {
  positive: {
    bar: 'border-l-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20',
    icon: TrendingUp,
    iconCls: 'text-emerald-600 dark:text-emerald-400',
    badgeCls: 'border-emerald-500/40 text-emerald-700 dark:text-emerald-400',
    label: '亮點',
  },
  warning: {
    bar: 'border-l-amber-500 bg-amber-50/40 dark:bg-amber-950/20',
    icon: AlertTriangle,
    iconCls: 'text-amber-600 dark:text-amber-400',
    badgeCls: 'border-amber-500/40 text-amber-700 dark:text-amber-400',
    label: '需注意',
  },
  info: {
    bar: 'border-l-sky-500 bg-sky-50/40 dark:bg-sky-950/20',
    icon: Info,
    iconCls: 'text-sky-600 dark:text-sky-400',
    badgeCls: 'border-sky-500/40 text-sky-700 dark:text-sky-400',
    label: '觀察',
  },
}

export function MonthlyReportCard() {
  const [snapshot, setSnapshot] = useState<MonthlyReportSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/insights/monthly-report')
      .then(r => r.json())
      .then(d => setSnapshot(d.snapshot ?? null))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function regenerate() {
    setRunning(true)
    setError(null)
    try {
      const res = await fetch('/api/insights/monthly-report', { method: 'POST' })
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
            <FileText className="h-4 w-4 text-primary" />
            月度體驗報告
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            整合滿意度 / NPS / 痛點 / 忠誠交叉，AI 寫成「發現 → 數據支持 → 建議行動」清單
            {snapshot && (
              <span className="ml-1.5">
                ・ {snapshot.month} ・ {new Date(snapshot.generatedAt).toLocaleString('zh-TW')}
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
            <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />產生中</>
          ) : snapshot ? (
            <><RefreshCw className="h-3.5 w-3.5 mr-1.5" />重新產生</>
          ) : (
            <><Sparkles className="h-3.5 w-3.5 mr-1.5" />產生月報</>
          )}
        </Button>
      </CardHeader>
      <CardContent>
        {error && <p className="text-xs text-destructive mb-3">{error}</p>}
        {loading ? (
          <p className="text-xs text-muted-foreground text-center py-6">載入中...</p>
        ) : !snapshot ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            尚未產生月報，點右上「產生月報」啟動（耗 1 份 Gemini 配額）
          </p>
        ) : (
          <div className="space-y-4">
            {snapshot.headline && (
              <div className="border rounded-md p-3 bg-accent/20">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">本月總結</div>
                <p className="text-base font-semibold leading-relaxed">{snapshot.headline}</p>
                <div className="text-[11px] text-muted-foreground mt-2 flex gap-3 flex-wrap">
                  <span>填答 {snapshot.overall.responses.toLocaleString()}</span>
                  <span>滿意度 {snapshot.overall.satisfied_pct.toFixed(1)}%</span>
                  <span>NPS {snapshot.overall.nps >= 0 ? '+' : ''}{snapshot.overall.nps.toFixed(1)}</span>
                  <span>{snapshot.overall.serviceCount} 個服務</span>
                </div>
              </div>
            )}
            <div className="space-y-2.5">
              {snapshot.findings.map((f, i) => {
                const style = toneStyles[f.tone]
                const Icon = style.icon
                return (
                  <div key={i} className={`border-l-2 rounded-r-md p-3 ${style.bar}`}>
                    <div className="flex items-start gap-2">
                      <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${style.iconCls}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                          <Badge variant="outline" className={`text-[10px] py-0 ${style.badgeCls}`}>{style.label}</Badge>
                          {f.source && <Badge variant="secondary" className="text-[10px] py-0">{f.source}</Badge>}
                          <span className="text-sm font-semibold">{f.title}</span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          <span className="font-medium text-foreground">數據：</span>{f.evidence}
                        </p>
                        <div className="mt-1.5 flex items-start gap-1.5 text-xs">
                          <Lightbulb className="h-3 w-3 mt-0.5 shrink-0 text-primary" />
                          <span className="text-foreground"><span className="font-medium">建議：</span>{f.recommendation}</span>
                        </div>
                      </div>
                    </div>
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
