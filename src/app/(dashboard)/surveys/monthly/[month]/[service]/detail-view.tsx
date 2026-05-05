'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sparkles, Loader2, RefreshCw, ChevronDown, ChevronUp, TrendingUp, AlertTriangle, Heart } from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { SurveyMonthlyMetrics, SurveyOptionDist, SurveyTheme } from '@/types'
import type { WeeklyPoint, CsatNpsCross, PainPoint } from '@/lib/monthly-survey-metrics'

export interface NpsBreakdown {
  promoters: { count: number; suggestion: SurveyOptionDist[]; complaint: SurveyOptionDist[] }
  detractors: { count: number; suggestion: SurveyOptionDist[]; complaint: SurveyOptionDist[] }
}

interface Props {
  metrics: SurveyMonthlyMetrics
  otherSuggestion: string[]
  otherComplaint: string[]
  npsBreakdown: NpsBreakdown
  weekly: WeeklyPoint[]
  csatNps: CsatNpsCross
  painPoints: PainPoint[]
}

export function MonthlyDetailView({
  metrics: initial,
  otherSuggestion,
  otherComplaint,
  npsBreakdown,
  weekly,
  csatNps,
  painPoints,
}: Props) {
  const [metrics, setMetrics] = useState(initial)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAllOpen, setShowAllOpen] = useState({ sug: false, com: false })

  async function runThemes() {
    setAnalyzing(true)
    setError(null)
    try {
      const res = await fetch('/api/surveys/monthly-themes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: metrics.month, service: metrics.service }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? '分析失敗')
      } else {
        setMetrics({ ...metrics, themes: data.themes, themes_updated_at: data.themes_updated_at })
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setAnalyzing(false)
    }
  }

  const totalFreeText = otherSuggestion.length + otherComplaint.length

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="滿意度%"
          value={`${metrics.satisfied_pct.toFixed(1)}%`}
          hint={`${metrics.satisfaction_dist['4'] + metrics.satisfaction_dist['5']} / ${metrics.responses}`}
        />
        <KpiCard
          label="滿意度量表"
          value={metrics.satisfaction_avg.toFixed(2)}
          hint="1–5 加權平均"
        />
        <KpiCard
          label="NPS"
          value={`${metrics.nps >= 0 ? '+' : ''}${metrics.nps.toFixed(1)}`}
          hint={`P:${metrics.promoters} / S:${metrics.passives} / D:${metrics.detractors}`}
        />
        <KpiCard
          label="權重比例"
          value={`${metrics.weight_pct.toFixed(1)}%`}
          hint="該服務 / 當月總填答"
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">滿意度 1–5 分布</CardTitle></CardHeader>
          <CardContent>
            <DistChart
              data={['1', '2', '3', '4', '5'].map(k => ({
                label: `${k} 分`,
                count: metrics.satisfaction_dist[k] ?? 0,
              }))}
              total={metrics.responses}
              colorAt={i => (i >= 3 ? 'bg-emerald-400' : i >= 2 ? 'bg-amber-400' : 'bg-rose-400')}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">NPS 0–10 分布</CardTitle></CardHeader>
          <CardContent>
            <DistChart
              data={Array.from({ length: 11 }, (_, i) => ({
                label: String(i),
                count: metrics.nps_dist[String(i)] ?? 0,
              }))}
              total={metrics.responses}
              colorAt={i => (i >= 9 ? 'bg-emerald-400' : i >= 7 ? 'bg-sky-400' : 'bg-rose-400')}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <RankCard
          title="正面建議排行"
          items={metrics.suggestion_dist}
          tone="positive"
        />
        <RankCard
          title="負面回饋排行"
          items={metrics.complaint_dist}
          tone="negative"
        />
      </div>

      <WeeklyTrendSection weekly={weekly} />

      <PainPointsSection items={painPoints} />

      <CsatNpsCrossSection cross={csatNps} overallNps={metrics.nps} />

      <NpsBreakdownSection breakdown={npsBreakdown} />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              自填文字主題分群（AI）
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              其他建議 {otherSuggestion.length} 條 ／ 其他抱怨 {otherComplaint.length} 條
              {metrics.themes_updated_at && (
                <span className="ml-2">・ 更新於 {new Date(metrics.themes_updated_at).toLocaleString('zh-TW')}</span>
              )}
            </p>
          </div>
          <Button
            size="sm"
            variant={metrics.themes ? 'outline' : 'default'}
            onClick={runThemes}
            disabled={analyzing || totalFreeText === 0}
          >
            {analyzing ? (
              <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />分析中</>
            ) : metrics.themes ? (
              <><RefreshCw className="h-3.5 w-3.5 mr-1.5" />重新分析</>
            ) : (
              <><Sparkles className="h-3.5 w-3.5 mr-1.5" />分析主題</>
            )}
          </Button>
        </CardHeader>
        <CardContent>
          {error && <p className="text-xs text-destructive mb-3">{error}</p>}
          {totalFreeText === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">此服務本月無自填文字</p>
          ) : !metrics.themes ? (
            <p className="text-xs text-muted-foreground text-center py-6">點「分析主題」用 Gemini 把自填文字分群（消耗 1–2 份配額）</p>
          ) : (
            <div className="grid lg:grid-cols-2 gap-4">
              <ThemeBlock title="正面建議主題" themes={metrics.themes.suggestion ?? []} />
              <ThemeBlock title="負面回饋主題" themes={metrics.themes.complaint ?? []} />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <RawTextList
          title="其他建議原文"
          items={otherSuggestion}
          open={showAllOpen.sug}
          onToggle={() => setShowAllOpen(s => ({ ...s, sug: !s.sug }))}
        />
        <RawTextList
          title="其他抱怨原文"
          items={otherComplaint}
          open={showAllOpen.com}
          onToggle={() => setShowAllOpen(s => ({ ...s, com: !s.com }))}
        />
      </div>
    </div>
  )
}

function WeeklyTrendSection({ weekly }: { weekly: WeeklyPoint[] }) {
  if (weekly.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4" />週度滿意度走勢</CardTitle>
        </CardHeader>
        <CardContent><p className="text-xs text-muted-foreground text-center py-3">無資料</p></CardContent>
      </Card>
    )
  }
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4" />週度滿意度走勢</CardTitle>
        <p className="text-xs text-muted-foreground mt-1">同月內按週切片，看哪一週分數拉升或下滑</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={weekly} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="week" fontSize={11} className="text-muted-foreground" />
            <YAxis yAxisId="left" fontSize={11} className="text-muted-foreground" domain={[0, 100]} />
            <YAxis yAxisId="right" orientation="right" fontSize={11} className="text-muted-foreground" domain={[-100, 100]} />
            <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))' }} />
            <Line yAxisId="left" type="monotone" dataKey="satisfied_pct" name="滿意度%" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
            <Line yAxisId="right" type="monotone" dataKey="nps" name="NPS" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
        <div className="overflow-x-auto border rounded-md">
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-2 py-1.5 text-left">週</th>
                <th className="px-2 py-1.5 text-left">日期</th>
                <th className="px-2 py-1.5 text-right">樣本數</th>
                <th className="px-2 py-1.5 text-right">滿意度%</th>
                <th className="px-2 py-1.5 text-right">滿意分</th>
                <th className="px-2 py-1.5 text-right">NPS</th>
              </tr>
            </thead>
            <tbody>
              {weekly.map(w => (
                <tr key={w.week} className="border-t">
                  <td className="px-2 py-1.5 font-medium">{w.week}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">{w.from}–{w.to} 日</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{w.count.toLocaleString()}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{w.satisfied_pct.toFixed(1)}%</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{w.satisfaction_avg.toFixed(2)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{w.nps >= 0 ? '+' : ''}{w.nps.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

function PainPointsSection({ items }: { items: PainPoint[] }) {
  if (items.length === 0) return null
  const maxPriority = items[0]?.priority ?? 1
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-600" />痛點優先級（頻次 × 不滿嚴重度）</CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          priority = 勾選次數 × (5 − 該選項用戶平均 CSAT)；avg NPS 越低代表這項把總分拉得越多
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto border rounded-md">
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-2 py-1.5 text-left w-8">#</th>
                <th className="px-2 py-1.5 text-left">議題</th>
                <th className="px-2 py-1.5 text-right">勾選</th>
                <th className="px-2 py-1.5 text-right">該群 CSAT</th>
                <th className="px-2 py-1.5 text-right">該群 NPS</th>
                <th className="px-2 py-1.5">priority</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p, i) => (
                <tr key={p.label} className="border-t">
                  <td className="px-2 py-2">
                    {i < 3 ? (
                      <span className="inline-block px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[10px] font-bold">TOP{i + 1}</span>
                    ) : (
                      <span className="text-muted-foreground">{i + 1}</span>
                    )}
                  </td>
                  <td className="px-2 py-2 font-medium truncate max-w-[280px]" title={p.label}>{p.label}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{p.count} ({p.pct.toFixed(1)}%)</td>
                  <td className="px-2 py-2 text-right tabular-nums">{p.avgCsat.toFixed(2)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{p.avgNps >= 0 ? '+' : ''}{p.avgNps.toFixed(1)}</td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-muted rounded overflow-hidden">
                        <div className="h-full bg-amber-400" style={{ width: `${(p.priority / maxPriority) * 100}%` }} />
                      </div>
                      <span className="w-12 text-right text-muted-foreground tabular-nums">{p.priority.toFixed(0)}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

function CsatNpsCrossSection({ cross, overallNps }: { cross: CsatNpsCross; overallNps: number }) {
  const loyalGap = cross.loyal.count > 0 ? cross.loyal.nps - 100 : null
  const unhappyShare = cross.unhappy.count > 0 ? cross.unhappy.detractors / cross.unhappy.count * 100 : 0

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2"><Heart className="h-4 w-4 text-rose-500" />CSAT × NPS 交叉</CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          看「忠誠用戶（CSAT=5）」是否還願意推薦，以及「不滿用戶（CSAT 1–2）」造成的負面口碑風險
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid lg:grid-cols-2 gap-4">
          <CsatNpsBlock
            title="忠誠用戶（CSAT=5）"
            tone="loyal"
            stat={cross.loyal}
            note={
              loyalGap === null
                ? '本月無 CSAT=5 用戶'
                : loyalGap < -20
                  ? `⚠ NPS 距離理想 100 還差 ${Math.abs(loyalGap).toFixed(1)} 分 — 滿意但不一定推薦，可能有競品或口碑顧慮`
                  : loyalGap < 0
                    ? `NPS 接近理想（差 ${Math.abs(loyalGap).toFixed(1)} 分）`
                    : '✓ 忠誠用戶推薦力滿格'
            }
          />
          <CsatNpsBlock
            title="不滿用戶（CSAT 1–2）"
            tone="unhappy"
            stat={cross.unhappy}
            note={
              cross.unhappy.count === 0
                ? '本月無 CSAT 1–2 用戶'
                : unhappyShare > 70
                  ? `⚠ ${unhappyShare.toFixed(1)}% 是 detractor，負面口碑擴散風險高`
                  : `${unhappyShare.toFixed(1)}% 是 detractor`
            }
          />
        </div>
        <p className="text-[11px] text-muted-foreground mt-3">
          整體 NPS：<span className="font-medium text-foreground tabular-nums">{overallNps >= 0 ? '+' : ''}{overallNps.toFixed(1)}</span>
        </p>
      </CardContent>
    </Card>
  )
}

function CsatNpsBlock({
  title,
  tone,
  stat,
  note,
}: {
  title: string
  tone: 'loyal' | 'unhappy'
  stat: { count: number; promoters: number; passives: number; detractors: number; nps: number }
  note: string
}) {
  const headerCls = tone === 'loyal'
    ? 'border-l-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20'
    : 'border-l-rose-500 bg-rose-50/40 dark:bg-rose-950/20'
  const total = stat.count || 1
  return (
    <div className={`border-l-2 rounded-r-md p-3 ${headerCls}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold">{title}</span>
        <Badge variant="secondary" className="text-[10px]">{stat.count} 筆</Badge>
      </div>
      <div className="text-2xl font-bold tabular-nums">
        {stat.count > 0 ? `${stat.nps >= 0 ? '+' : ''}${stat.nps.toFixed(1)}` : '—'}
        <span className="text-xs text-muted-foreground font-normal ml-2">NPS</span>
      </div>
      <div className="grid grid-cols-3 gap-1 text-[11px] text-muted-foreground mt-2">
        <div>P: <span className="font-medium text-foreground tabular-nums">{stat.promoters}</span> ({(stat.promoters / total * 100).toFixed(0)}%)</div>
        <div>S: <span className="font-medium text-foreground tabular-nums">{stat.passives}</span> ({(stat.passives / total * 100).toFixed(0)}%)</div>
        <div>D: <span className="font-medium text-foreground tabular-nums">{stat.detractors}</span> ({(stat.detractors / total * 100).toFixed(0)}%)</div>
      </div>
      <p className="text-xs mt-2.5 leading-relaxed">{note}</p>
    </div>
  )
}

function NpsBreakdownSection({ breakdown }: { breakdown: NpsBreakdown }) {
  const { promoters, detractors } = breakdown
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Promoter vs Detractor 議題切片</CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          以 NPS 分群：Promoter (9–10) {promoters.count} 筆 ／ Detractor (0–6) {detractors.count} 筆。看「驅動高分」與「驅動低分」的議題差異
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid lg:grid-cols-2 gap-4">
          <NpsGroupBlock
            title="Promoter (NPS 9–10)"
            count={promoters.count}
            suggestion={promoters.suggestion}
            complaint={promoters.complaint}
            tone="positive"
          />
          <NpsGroupBlock
            title="Detractor (NPS 0–6)"
            count={detractors.count}
            suggestion={detractors.suggestion}
            complaint={detractors.complaint}
            tone="negative"
          />
        </div>
      </CardContent>
    </Card>
  )
}

function NpsGroupBlock({
  title,
  count,
  suggestion,
  complaint,
  tone,
}: {
  title: string
  count: number
  suggestion: SurveyOptionDist[]
  complaint: SurveyOptionDist[]
  tone: 'positive' | 'negative'
}) {
  const headerCls = tone === 'positive'
    ? 'border-l-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20'
    : 'border-l-rose-500 bg-rose-50/40 dark:bg-rose-950/20'
  return (
    <div className={`border-l-2 rounded-r-md p-3 space-y-3 ${headerCls}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{title}</span>
        <Badge variant="secondary" className="text-[10px]">{count} 筆</Badge>
      </div>
      <NpsMiniRank label="正面建議 Top 5" items={suggestion} tone="positive" />
      <NpsMiniRank label="負面回饋 Top 5" items={complaint} tone="negative" />
    </div>
  )
}

function NpsMiniRank({
  label,
  items,
  tone,
}: {
  label: string
  items: SurveyOptionDist[]
  tone: 'positive' | 'negative'
}) {
  const barColor = tone === 'positive' ? 'bg-emerald-400' : 'bg-rose-400'
  return (
    <div>
      <div className="text-[11px] font-medium text-muted-foreground mb-1.5">{label}</div>
      {items.length === 0 ? (
        <p className="text-[11px] text-muted-foreground italic">—</p>
      ) : (
        <div className="space-y-1">
          {items.map(it => (
            <div key={it.label} className="flex items-center gap-2 text-[11px]">
              <div className="flex-1 min-w-0">
                <div className="truncate" title={it.label}>{it.label}</div>
                <div className="h-1 bg-muted rounded mt-0.5 overflow-hidden">
                  <div className={`h-full ${barColor}`} style={{ width: `${Math.min(100, it.pct)}%` }} />
                </div>
              </div>
              <div className="w-16 text-right text-muted-foreground tabular-nums shrink-0">
                {it.count} ({it.pct.toFixed(1)}%)
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function KpiCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold tabular-nums mt-1">{value}</div>
        {hint && <div className="text-[10px] text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  )
}

function DistChart({
  data,
  total,
  colorAt,
}: {
  data: { label: string; count: number }[]
  total: number
  colorAt: (i: number) => string
}) {
  const max = Math.max(...data.map(d => d.count), 1)
  return (
    <div className="space-y-1.5">
      {data.map((d, i) => {
        const pct = total > 0 ? (d.count / total) * 100 : 0
        const w = (d.count / max) * 100
        return (
          <div key={d.label} className="flex items-center gap-2 text-xs">
            <div className="w-10 text-muted-foreground tabular-nums">{d.label}</div>
            <div className="flex-1 h-5 bg-muted rounded relative overflow-hidden">
              <div className={`h-full ${colorAt(i)} transition-all`} style={{ width: `${w}%` }} />
            </div>
            <div className="w-20 text-right text-muted-foreground tabular-nums">
              {d.count} ({pct.toFixed(1)}%)
            </div>
          </div>
        )
      })}
    </div>
  )
}

function RankCard({
  title,
  items,
  tone,
}: {
  title: string
  items: { label: string; count: number; pct: number }[]
  tone: 'positive' | 'negative'
}) {
  const barColor = tone === 'positive' ? 'bg-emerald-400' : 'bg-rose-400'
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span>{title}</span>
          <Badge variant="secondary" className="text-[10px]">{items.length} 個選項</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">無資料</p>
        ) : (
          <div className="space-y-1.5">
            {items.map(it => (
              <div key={it.label} className="flex items-center gap-2 text-xs">
                <div className="flex-1 min-w-0">
                  <div className="truncate" title={it.label}>{it.label}</div>
                  <div className="h-1.5 bg-muted rounded mt-0.5 overflow-hidden">
                    <div className={`h-full ${barColor}`} style={{ width: `${Math.min(100, it.pct)}%` }} />
                  </div>
                </div>
                <div className="w-20 text-right text-muted-foreground tabular-nums shrink-0">
                  {it.count} ({it.pct.toFixed(1)}%)
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ThemeBlock({ title, themes }: { title: string; themes: SurveyTheme[] }) {
  return (
    <div>
      <div className="text-xs font-semibold mb-2">{title}</div>
      {themes.length === 0 ? (
        <p className="text-xs text-muted-foreground">—</p>
      ) : (
        <div className="space-y-2">
          {themes.map((t, i) => (
            <div key={i} className="border rounded-sm p-2.5 bg-accent/10">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium truncate">{t.label}</span>
                <Badge variant="secondary" className="text-[10px] shrink-0">{t.count}</Badge>
              </div>
              {t.examples.length > 0 && (
                <ul className="text-[11px] text-muted-foreground mt-1.5 space-y-0.5">
                  {t.examples.map((ex, j) => (
                    <li key={j} className="line-clamp-2 italic">「{ex}」</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RawTextList({
  title,
  items,
  open,
  onToggle,
}: {
  title: string
  items: string[]
  open: boolean
  onToggle: () => void
}) {
  const visible = open ? items : items.slice(0, 5)
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title} <span className="text-xs font-normal text-muted-foreground">（{items.length} 條）</span></CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3">無</p>
        ) : (
          <>
            <ul className="space-y-1.5 text-xs">
              {visible.map((t, i) => (
                <li key={i} className="border-l-2 border-primary/30 pl-2 py-0.5 text-muted-foreground italic line-clamp-3">「{t}」</li>
              ))}
            </ul>
            {items.length > 5 && (
              <Button variant="ghost" size="sm" onClick={onToggle} className="mt-2 text-xs">
                {open ? <><ChevronUp className="h-3 w-3 mr-1" />收合</> : <><ChevronDown className="h-3 w-3 mr-1" />展開全部 {items.length} 條</>}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
