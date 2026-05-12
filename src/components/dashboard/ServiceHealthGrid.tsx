'use client'

import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { AlertOctagon, ArrowUpRight, Car, Bike, Package, KeyRound } from 'lucide-react'

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

function npsTone(nps: number): { bg: string; fg: string } {
  if (nps >= 50) return { bg: 'bg-emerald-50 dark:bg-emerald-950/30', fg: 'text-emerald-700 dark:text-emerald-400' }
  if (nps >= 0) return { bg: 'bg-amber-50 dark:bg-amber-950/30', fg: 'text-amber-700 dark:text-amber-400' }
  return { bg: 'bg-rose-50 dark:bg-rose-950/30', fg: 'text-rose-700 dark:text-rose-400' }
}

function ServiceHealthCard({ data }: { data: ServiceHealth }) {
  const Icon = ICON_BY_SERVICE[data.service] ?? Car
  const tone = npsTone(data.nps)

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
              <span className="text-sm font-semibold">{data.label}</span>
            </div>
            <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className={`rounded-md ${tone.bg} px-2 py-1.5`}>
              <div className="text-[10px] text-muted-foreground">NPS</div>
              <div className={`text-lg font-bold tabular-nums ${tone.fg}`}>
                {data.nps >= 0 ? '+' : ''}{data.nps.toFixed(1)}
              </div>
            </div>
            <div className="rounded-md bg-muted/40 px-2 py-1.5">
              <div className="text-[10px] text-muted-foreground">滿意度</div>
              <div className="text-lg font-bold tabular-nums">
                {data.satisfied_pct.toFixed(0)}<span className="text-xs">%</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="tabular-nums">{data.responses.toLocaleString()} 回覆</span>
            <span>{data.month}</span>
          </div>

          {data.prioritizeCount > 0 ? (
            <div className="flex items-center gap-1.5 rounded-md border border-rose-300/60 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/15 px-2 py-1">
              <AlertOctagon className="h-3 w-3 text-rose-600 dark:text-rose-400" />
              <span className="text-[11px] font-medium text-rose-700 dark:text-rose-400">
                {data.prioritizeCount} 個 prioritize
              </span>
              {data.risingCount > 0 && (
                <span className="text-[11px] text-rose-600 dark:text-rose-400">
                  · {data.risingCount} 上升
                </span>
              )}
            </div>
          ) : (
            <div className="text-[11px] text-muted-foreground px-2 py-1">無 prioritize 議題</div>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}

export function ServiceHealthGrid({ services }: { services: ServiceHealth[] }) {
  if (services.length === 0) return null
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground tracking-wider uppercase">
          跨服務健康度
        </h2>
        <span className="text-[11px] text-muted-foreground">點卡片查看 issue trends</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {services.map(s => (
          <ServiceHealthCard key={s.service} data={s} />
        ))}
      </div>
    </div>
  )
}
