'use client'

import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowUpRight, Car, Bike, Package, KeyRound } from 'lucide-react'

export interface ServiceHealth {
  service: string                  // taxi / rental / scooter / shuttle
  label: string                    // 計程車 / 租車 ...
  month: string                    // 2026-03
  responses: number
  nps: number                      // -100 to 100
  satisfied_pct: number            // 0-100
  prioritizeCount: number
  risingCount: number              // # of issues with trend=rising
}

const ICON_BY_SERVICE: Record<string, React.ComponentType<{ className?: string }>> = {
  taxi: Car,
  rental: KeyRound,
  scooter: Bike,
  shuttle: Package,
}

function npsStatus(nps: number): { label: string; variant: 'default' | 'secondary' | 'outline' } {
  if (nps >= 50) return { label: '良好', variant: 'secondary' }
  if (nps >= 0) return { label: '持平', variant: 'outline' }
  return { label: '待改善', variant: 'default' }
}

function ServiceHealthCard({ data }: { data: ServiceHealth }) {
  const Icon = ICON_BY_SERVICE[data.service] ?? Car
  const status = npsStatus(data.nps)

  return (
    <Link
      href="/surveys"
      className="group block"
    >
      <Card className="h-full transition-colors hover:border-primary/40">
        <CardContent className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Icon className="h-4 w-4 text-muted-foreground" />
              <span className="text-base font-semibold">{data.label}</span>
            </div>
            <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md bg-muted/40 px-2 py-1.5">
              <div className="flex items-center justify-between gap-1">
                <span className="text-sm text-muted-foreground">NPS</span>
                <Badge variant={status.variant} className="text-[10px] py-0 px-1 leading-tight">
                  {status.label}
                </Badge>
              </div>
              <div className="text-lg font-bold tabular-nums">
                {data.nps.toFixed(1)}
              </div>
            </div>
            <div className="rounded-md bg-muted/40 px-2 py-1.5">
              <div className="text-sm text-muted-foreground">滿意度</div>
              <div className="text-lg font-bold tabular-nums">
                {data.satisfied_pct.toFixed(0)}<span className="text-xs">%</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="tabular-nums">{data.responses.toLocaleString()} 回覆</span>
            <span>{data.month}</span>
          </div>

          {data.prioritizeCount > 0 ? (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground px-1">
              <Badge variant="outline" className="text-[10px] py-0">
                {data.prioritizeCount} prioritize
              </Badge>
              {data.risingCount > 0 && <span>· {data.risingCount} 上升</span>}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground px-1">無 prioritize 議題</div>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}

function computeAggregate(services: ServiceHealth[]) {
  const totalResponses = services.reduce((s, x) => s + x.responses, 0)
  if (totalResponses === 0) return null
  // Weight by responses for fair aggregate
  const weightedNps = services.reduce((s, x) => s + x.nps * x.responses, 0) / totalResponses
  const weightedSatisfied = services.reduce((s, x) => s + x.satisfied_pct * x.responses, 0) / totalResponses
  const totalPrioritize = services.reduce((s, x) => s + x.prioritizeCount, 0)
  return { totalResponses, nps: weightedNps, satisfied: weightedSatisfied, prioritize: totalPrioritize }
}

export function ServiceHealthGrid({ services }: { services: ServiceHealth[] }) {
  if (services.length === 0) return null
  const agg = computeAggregate(services)
  const aggStatus = agg ? npsStatus(agg.nps) : null

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">
          跨服務健康度
        </h2>
        <span className="text-xs text-muted-foreground">點卡片查看 issue trends</span>
      </div>

      {agg && aggStatus && (
        <div className="rounded-lg border bg-card px-4 py-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">
              總體（4 服務合計，按回覆數加權）
            </div>
            <div className="text-xs text-muted-foreground tabular-nums">
              {agg.totalResponses.toLocaleString()} 回覆
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 mt-2">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-muted-foreground">總體 NPS</span>
                <Badge variant={aggStatus.variant} className="text-[10px] py-0 px-1 leading-tight">
                  {aggStatus.label}
                </Badge>
              </div>
              <div className="text-2xl font-bold tabular-nums">
                {agg.nps.toFixed(1)}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">總體滿意度</div>
              <div className="text-2xl font-bold tabular-nums">
                {agg.satisfied.toFixed(1)}<span className="text-sm">%</span>
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Prioritize 議題</div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold tabular-nums">{agg.prioritize}</span>
                {agg.prioritize > 0 && (
                  <Badge variant="outline" className="text-[10px] py-0">需追蹤</Badge>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {services.map(s => (
          <ServiceHealthCard key={s.service} data={s} />
        ))}
      </div>
    </div>
  )
}
