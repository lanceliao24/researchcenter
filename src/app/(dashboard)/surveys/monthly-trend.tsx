'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TrendingUp } from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'

interface TrendPoint {
  month: string
  satisfied_pct: number
  satisfaction_pct_norm: number
  nps: number
  responses: number
}

type MetricKey = 'satisfied_pct' | 'satisfaction_pct_norm' | 'nps'

const METRIC_OPTIONS: { value: MetricKey; label: string; suffix: string; color: string }[] = [
  { value: 'satisfied_pct', label: '滿意度%', suffix: '%', color: '#10b981' },
  { value: 'satisfaction_pct_norm', label: '標準化滿意分%', suffix: '%', color: '#0ea5e9' },
  { value: 'nps', label: 'NPS', suffix: '', color: '#8b5cf6' },
]

export function MonthlyTrend() {
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [metric, setMetric] = useState<MetricKey>('nps')

  useEffect(() => {
    fetch('/api/surveys/monthly?include=trend')
      .then(r => r.json())
      .then(d => setTrend(d.trend ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const config = useMemo(() => METRIC_OPTIONS.find(o => o.value === metric)!, [metric])

  const chartData = useMemo(
    () =>
      trend.map(t => ({
        month: t.month,
        value: t[metric],
        responses: t.responses,
      })),
    [trend, metric],
  )

  const summary = useMemo(() => {
    if (chartData.length === 0) return null
    const last = chartData[chartData.length - 1]
    const prev = chartData[chartData.length - 2]
    const delta = prev ? last.value - prev.value : null
    return { last, prev, delta }
  }, [chartData])

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2 pb-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            多月走勢
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            匯入多個月後可看到指標的時間序列；目前 {trend.length} 個月
          </p>
        </div>
        <Select value={metric} onValueChange={v => v && setMetric(v as MetricKey)}>
          <SelectTrigger className="w-[160px] h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {METRIC_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-xs text-muted-foreground text-center py-8">載入中...</p>
        ) : chartData.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">尚無資料</p>
        ) : chartData.length === 1 ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground text-center py-2">
              只有 1 個月份資料，下個月匯入後會自動延伸成走勢圖
            </p>
            <div className="border rounded-lg p-4 bg-accent/20 text-center">
              <div className="text-xs text-muted-foreground">{chartData[0].month}</div>
              <div className="text-3xl font-bold tabular-nums mt-1" style={{ color: config.color }}>
                {chartData[0].value.toFixed(1)}{config.suffix}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                {chartData[0].responses.toLocaleString()} 筆填答
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" fontSize={11} className="text-muted-foreground" />
                <YAxis fontSize={11} className="text-muted-foreground" />
                <Tooltip
                  formatter={(v) => {
                    const num = typeof v === 'number' ? v : Number(v)
                    return [`${num.toFixed(1)}${config.suffix}`, config.label]
                  }}
                  contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
                />
                {metric === 'nps' && <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />}
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={config.color}
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
            {summary && summary.delta !== null && (
              <div className="text-xs text-muted-foreground flex items-center justify-end gap-2">
                <span>{summary.last.month}：<span className="font-medium text-foreground">{summary.last.value.toFixed(1)}{config.suffix}</span></span>
                <span className={summary.delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                  ({summary.delta >= 0 ? '+' : ''}{summary.delta.toFixed(1)}{config.suffix} vs 上月)
                </span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
