import Link from 'next/link'
import { ArrowRight, ClipboardList } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export interface MonthlyOverview {
  month: string
  responses: number
  serviceCount: number
  satisfied_pct: number
  satisfaction_avg: number
  nps: number
  promoters: number
  detractors: number
}

interface Props {
  overview: MonthlyOverview | null
  showHeader?: boolean
  ctaHref?: string
}

export function MonthlyOverviewCard({ overview, showHeader = true, ctaHref }: Props) {
  if (!overview) {
    return showHeader ? (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            最新月度問卷
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground py-4 text-center">
            尚未匯入月度問卷資料
            {ctaHref && (
              <Link href={ctaHref} className="ml-2 text-primary hover:underline">
                前往匯入 →
              </Link>
            )}
          </p>
        </CardContent>
      </Card>
    ) : null
  }

  const body = (
    <div className="flex flex-col gap-4 h-full">
      <div className="grid grid-cols-2 gap-3">
        <OverviewKpi
          label="滿意度%"
          value={`${overview.satisfied_pct.toFixed(1)}%`}
          hint="4–5 分人數 / 總填答"
        />
        <OverviewKpi
          label="NPS"
          value={`${overview.nps >= 0 ? '+' : ''}${overview.nps.toFixed(1)}`}
          hint={`P:${overview.promoters} / D:${overview.detractors}`}
        />
      </div>
      <div className="mt-auto pt-2 border-t flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          總填答 <span className="font-medium text-foreground tabular-nums">{overview.responses.toLocaleString()}</span> 筆
          <span className="mx-1.5">・</span>
          {overview.serviceCount} 個服務
        </span>
        <span>標準化滿意分 {((overview.satisfaction_avg / 5) * 100).toFixed(1)}% (量表 {overview.satisfaction_avg.toFixed(2)} / 5)</span>
      </div>
    </div>
  )

  if (!showHeader) return body

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-row items-start justify-between pb-3">
        <div>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            最新月度問卷（{overview.month}）
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            滿意度% / NPS — 加權至所有服務
          </p>
        </div>
        {ctaHref && (
          <Link
            href={ctaHref}
            className="text-xs text-primary hover:underline font-medium flex items-center gap-1"
          >
            完整分析 <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">{body}</CardContent>
    </Card>
  )
}

function OverviewKpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border rounded-lg p-4 bg-accent/20">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-3xl font-bold tabular-nums mt-1">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>}
    </div>
  )
}
