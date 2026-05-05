import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { isLocalMode } from '@/lib/local-mode'
import { getMetrics, loadMonthRawRows } from '@/lib/monthly-survey-store'
import { buildDist, buildWeeklyTrend, buildCsatNpsCross, buildPainPoints } from '@/lib/monthly-survey-metrics'
import { surveyServiceLabel } from '@/types'
import { buttonVariants } from '@/components/ui/button'
import { MonthlyDetailView } from './detail-view'

interface PageProps {
  params: Promise<{ month: string; service: string }>
}

export default async function MonthlySurveyDetail({ params }: PageProps) {
  if (!isLocalMode()) {
    return <p className="text-sm text-muted-foreground p-6">production not implemented</p>
  }
  const { month, service } = await params
  const metrics = getMetrics(month, service)
  if (!metrics) notFound()

  const rawRows = loadMonthRawRows(month).filter(r => r.service === service)
  const otherSuggestion: string[] = []
  const otherComplaint: string[] = []
  for (const r of rawRows) {
    for (const s of r.other_suggestion) if (s.trim()) otherSuggestion.push(s.trim())
    for (const c of r.other_complaints) if (c.trim()) otherComplaint.push(c.trim())
  }

  const promoters = rawRows.filter(r => r.nps >= 9)
  const detractors = rawRows.filter(r => r.nps <= 6)
  const npsBreakdown = {
    promoters: {
      count: promoters.length,
      suggestion: buildDist(promoters, r => r.suggestion).slice(0, 5),
      complaint: buildDist(promoters, r => r.complaints).slice(0, 5),
    },
    detractors: {
      count: detractors.length,
      suggestion: buildDist(detractors, r => r.suggestion).slice(0, 5),
      complaint: buildDist(detractors, r => r.complaints).slice(0, 5),
    },
  }

  const weekly = buildWeeklyTrend(rawRows)
  const csatNps = buildCsatNpsCross(rawRows)
  const painPoints = buildPainPoints(rawRows).slice(0, 8)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/surveys" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          <ArrowLeft className="h-4 w-4 mr-1" />返回問卷
        </Link>
        <div>
          <h1 className="text-2xl font-bold">
            {surveyServiceLabel(service)}
            <span className="ml-2 text-base text-muted-foreground font-mono">{service}</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            {month} ・ {metrics.responses.toLocaleString()} 筆填答 ・ 占當月 {metrics.weight_pct.toFixed(1)}%
          </p>
        </div>
      </div>

      <MonthlyDetailView
        metrics={metrics}
        otherSuggestion={otherSuggestion}
        otherComplaint={otherComplaint}
        npsBreakdown={npsBreakdown}
        weekly={weekly}
        csatNps={csatNps}
        painPoints={painPoints}
      />
    </div>
  )
}
