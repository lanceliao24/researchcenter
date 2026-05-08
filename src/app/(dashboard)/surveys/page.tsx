import { isLocalMode } from '@/lib/local-mode'
import { mockDocuments } from '@/lib/mock-data'
import { FileUploader } from '@/components/upload/FileUploader'
import { SurveyList } from './survey-list'
import { MonthlySnapshot } from './monthly-snapshot'
import { MonthlyTrend } from './monthly-trend'
import { IssueTrendsCard } from './issue-trends'
import { TopicAlignmentCard } from '@/components/insights/topic-alignment'
import { MonthlyReportCard } from '@/components/insights/monthly-report'
import { CompetitorAlignmentCard } from '@/components/insights/competitor-alignment'
import { listMetricsByMonth, listMonths } from '@/lib/monthly-survey-store'
import type { Document, SurveyMonthlyMetrics } from '@/types'

export default async function SurveysPage() {
  let documents: Document[] = mockDocuments.filter(d => d.type === 'survey')
  let totalResponses = 3042

  let monthlyMonths: string[] = []
  let monthlyMetrics: SurveyMonthlyMetrics[] = []
  let monthlyInitialMonth: string | null = null

  if (isLocalMode()) {
    const { getLocalDocuments } = await import('@/lib/local-store')
    const uploaded = getLocalDocuments('survey')
    documents = [...uploaded, ...documents]
    const uploadedRows = uploaded.reduce((sum, d) => {
      const rows = (d.metadata as Record<string, unknown>)?.rows
      return sum + (typeof rows === 'number' ? rows : 0)
    }, 0)
    totalResponses = 3042 + uploadedRows

    monthlyMonths = listMonths()
    monthlyInitialMonth = monthlyMonths[0] ?? null
    monthlyMetrics = monthlyInitialMonth ? listMetricsByMonth(monthlyInitialMonth) : []
  } else {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    const { data } = await supabase
      .from('documents')
      .select('*')
      .eq('type', 'survey')
      .order('created_at', { ascending: false })
    if (data) documents = data
    const { count } = await supabase
      .from('survey_responses')
      .select('*', { count: 'exact', head: true })
    totalResponses = count ?? 0
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">問卷分析</h1>
          <p className="text-sm text-muted-foreground mt-1">
            共 {totalResponses.toLocaleString()} 筆問卷回覆，來自 {documents.length} 份檔案
          </p>
        </div>
      </div>

      <MonthlySnapshot
        initialMonth={monthlyInitialMonth}
        months={monthlyMonths}
        metrics={monthlyMetrics}
      />

      {monthlyMonths.length > 0 && <MonthlyReportCard />}

      {monthlyMonths.length > 0 && <MonthlyTrend />}

      <IssueTrendsCard />

      {monthlyMonths.length > 0 && <TopicAlignmentCard />}

      {monthlyMonths.length > 0 && <CompetitorAlignmentCard />}

      <FileUploader type="survey" accept=".csv" />

      <SurveyList documents={documents} isLocal={isLocalMode()} />
    </div>
  )
}
