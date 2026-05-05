'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Upload, Loader2, ChevronRight, BarChart3 } from 'lucide-react'
import { surveyServiceLabel, type SurveyMonthlyMetrics } from '@/types'
import { MonthlyOverviewCard, type MonthlyOverview } from '@/components/surveys/monthly-overview'

interface Props {
  initialMonth: string | null
  months: string[]
  metrics: SurveyMonthlyMetrics[]
}

type SortKey = 'responses' | 'satisfied_pct' | 'satisfaction_avg' | 'nps' | 'weight_pct'

export function MonthlySnapshot({ initialMonth, months: initialMonths, metrics: initialMetrics }: Props) {
  const router = useRouter()
  const fileInput = useRef<HTMLInputElement>(null)
  const [months, setMonths] = useState(initialMonths)
  const [month, setMonth] = useState(initialMonth ?? '')
  const [metrics, setMetrics] = useState<SurveyMonthlyMetrics[]>(initialMetrics)
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState<string | null>(null)
  const [uploadErr, setUploadErr] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('responses')

  const overall = useMemo<MonthlyOverview | null>(() => {
    if (metrics.length === 0) return null
    let responses = 0
    let satFour = 0
    let satSum = 0
    let promoters = 0
    let detractors = 0
    for (const m of metrics) {
      responses += m.responses
      satFour += (m.satisfaction_dist['4'] ?? 0) + (m.satisfaction_dist['5'] ?? 0)
      satSum += m.satisfaction_avg * m.responses
      promoters += m.promoters
      detractors += m.detractors
    }
    if (responses === 0) return null
    return {
      month,
      responses,
      serviceCount: metrics.length,
      satisfied_pct: (satFour / responses) * 100,
      satisfaction_avg: satSum / responses,
      nps: ((promoters - detractors) / responses) * 100,
      promoters,
      detractors,
    }
  }, [metrics, month])

  const sorted = useMemo(() => {
    return [...metrics].sort((a, b) => b[sortKey] - a[sortKey])
  }, [metrics, sortKey])

  async function loadMonth(m: string) {
    if (!m) return
    const res = await fetch(`/api/surveys/monthly?month=${encodeURIComponent(m)}`)
    if (res.ok) {
      const data = await res.json()
      setMetrics(data.metrics ?? [])
    }
  }

  useEffect(() => {
    if (month && month !== initialMonth) loadMonth(month)
  }, [month])

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setUploading(true)
    setUploadMsg(null)
    setUploadErr(null)
    try {
      const fd = new FormData()
      fd.append('file', f)
      const res = await fetch('/api/surveys/monthly-import', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) {
        setUploadErr(data.error ?? '匯入失敗')
      } else {
        const monthsImported: string[] = data.imported_months ?? []
        setUploadMsg(
          `匯入 ${data.total_rows} 筆（跳過 ${data.skipped}）｜月份：${monthsImported.join(', ')}`,
        )
        const monthsRes = await fetch('/api/surveys/monthly')
        if (monthsRes.ok) {
          const md = await monthsRes.json()
          setMonths(md.months ?? [])
          if (monthsImported.length > 0) setMonth(monthsImported[monthsImported.length - 1])
        }
        router.refresh()
      }
    } catch (err) {
      setUploadErr((err as Error).message)
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            月度問卷快照
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            每月匯入一次（依 <code>updated_at</code> 自動分月），4 大指標：滿意度% / 滿意分量表 / NPS / 權重比例
          </p>
        </div>
        <div className="flex items-center gap-2">
          {months.length > 0 && (
            <Select value={month} onValueChange={v => v && setMonth(v)}>
              <SelectTrigger className="w-[140px] h-9 text-sm">
                <SelectValue placeholder="選月份" />
              </SelectTrigger>
              <SelectContent>
                {months.map(m => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <input
            ref={fileInput}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleFile}
          />
          <Button
            size="sm"
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />匯入中</>
            ) : (
              <><Upload className="h-3.5 w-3.5 mr-1.5" />匯入月度 CSV</>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {uploadErr && <p className="text-xs text-destructive mb-3">{uploadErr}</p>}
        {uploadMsg && <p className="text-xs text-muted-foreground mb-3">✅ {uploadMsg}</p>}

        {metrics.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {months.length === 0
              ? '尚未匯入月度資料，點右上「匯入月度 CSV」開始'
              : '此月份無資料'}
          </p>
        ) : (
          <div className="space-y-4">
            <MonthlyOverviewCard overview={overall} showHeader={false} />
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                依服務拆分（{metrics.length} 個服務）
              </span>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">排序</span>
                <Select value={sortKey} onValueChange={v => v && setSortKey(v as SortKey)}>
                  <SelectTrigger className="w-[120px] h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="responses">填答數</SelectItem>
                    <SelectItem value="satisfied_pct">滿意度%</SelectItem>
                    <SelectItem value="satisfaction_avg">滿意分</SelectItem>
                    <SelectItem value="nps">NPS</SelectItem>
                    <SelectItem value="weight_pct">權重%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">服務</th>
                    <th className="px-3 py-2 text-right font-medium">填答數</th>
                    <th className="px-3 py-2 text-right font-medium">權重%</th>
                    <th className="px-3 py-2 text-right font-medium">滿意度%</th>
                    <th className="px-3 py-2 text-right font-medium">滿意分</th>
                    <th className="px-3 py-2 text-right font-medium">NPS</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(m => (
                    <tr key={m.service} className="border-t hover:bg-accent/40 transition-colors">
                      <td className="px-3 py-2.5">
                        <div className="font-medium">{surveyServiceLabel(m.service)}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{m.service}</div>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {m.responses.toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                        {m.weight_pct.toFixed(1)}%
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <SatisfiedBadge value={m.satisfied_pct} />
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {m.satisfaction_avg.toFixed(2)}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <NpsBadge value={m.nps} />
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Link
                          href={`/surveys/monthly/${m.month}/${m.service}`}
                          className={buttonVariants({ variant: 'ghost', size: 'sm' }) + ' text-xs gap-1'}
                        >
                          詳情 <ChevronRight className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function SatisfiedBadge({ value }: { value: number }) {
  const tone =
    value >= 80 ? 'bg-emerald-100 text-emerald-700' :
    value >= 60 ? 'bg-amber-100 text-amber-700' :
    'bg-rose-100 text-rose-700'
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium tabular-nums ${tone}`}>{value.toFixed(1)}%</span>
}

function NpsBadge({ value }: { value: number }) {
  const sign = value >= 0 ? '+' : ''
  const tone =
    value >= 50 ? 'bg-emerald-100 text-emerald-700' :
    value >= 0 ? 'bg-sky-100 text-sky-700' :
    'bg-rose-100 text-rose-700'
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium tabular-nums ${tone}`}>{sign}{value.toFixed(1)}</span>
}
