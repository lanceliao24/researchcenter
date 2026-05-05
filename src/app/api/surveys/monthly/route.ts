import { NextRequest, NextResponse } from 'next/server'
import { isLocalMode } from '@/lib/local-mode'
import { getMonthlyOverview, listMetricsByMonth, listMonths } from '@/lib/monthly-survey-store'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  if (!isLocalMode()) {
    return NextResponse.json({ error: 'production not implemented' }, { status: 501 })
  }
  const params = req.nextUrl.searchParams
  const month = params.get('month')
  const months = listMonths()

  if (params.get('include') === 'trend') {
    const trend = months
      .slice()
      .sort()
      .map(m => {
        const o = getMonthlyOverview(m)
        if (!o) return null
        return {
          month: m,
          satisfied_pct: o.satisfied_pct,
          satisfaction_pct_norm: (o.satisfaction_avg / 5) * 100,
          nps: o.nps,
          responses: o.responses,
        }
      })
      .filter(Boolean)
    return NextResponse.json({ months, trend })
  }

  if (!month) {
    return NextResponse.json({ months })
  }
  return NextResponse.json({ months, month, metrics: listMetricsByMonth(month) })
}
