'use client'

import Link from 'next/link'
import { AlertOctagon, TrendingUp, Minus, ArrowRight } from 'lucide-react'

export interface PriorityIssue {
  service: string
  serviceLabel: string
  title: string
  trend: 'rising' | 'falling' | 'stable' | 'single'
  impact: 'high' | 'medium' | 'low'
  confidence: 'high' | 'medium' | 'low'
}

const trendIcon = {
  rising: TrendingUp,
  falling: Minus,
  stable: Minus,
  single: Minus,
}

export function PriorityChips({ issues }: { issues: PriorityIssue[] }) {
  if (issues.length === 0) return null

  // Group by service. Within each group, rising-trend issues come first.
  const groups = new Map<string, { label: string; items: PriorityIssue[] }>()
  for (const iss of issues) {
    const g = groups.get(iss.service)
    if (g) g.items.push(iss)
    else groups.set(iss.service, { label: iss.serviceLabel, items: [iss] })
  }
  const ordered = Array.from(groups.entries()).map(([service, g]) => ({
    service,
    label: g.label,
    items: [...g.items].sort((a, b) => {
      if (a.trend === 'rising' && b.trend !== 'rising') return -1
      if (a.trend !== 'rising' && b.trend === 'rising') return 1
      return 0
    }),
    risingCount: g.items.filter(x => x.trend === 'rising').length,
  }))
  // Sort groups: groups with rising-trend issues first, then by item count.
  ordered.sort((a, b) => {
    if (a.risingCount !== b.risingCount) return b.risingCount - a.risingCount
    return b.items.length - a.items.length
  })

  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <AlertOctagon className="h-4 w-4 text-rose-600 dark:text-rose-400" />
          <span className="text-sm font-semibold">本期最該處理</span>
          <span className="text-xs text-muted-foreground">（{issues.length} 個 prioritize 議題）</span>
        </div>
        <Link
          href="/surveys"
          className="text-xs text-muted-foreground hover:text-foreground hover:underline font-medium inline-flex items-center gap-0.5"
        >
          全部 <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-4">
        {ordered.map(g => (
          <div key={g.service}>
            <div className="text-xs font-medium text-foreground mb-2 pb-1.5 border-b border-border/60">
              {g.label}
              <span className="ml-1.5 text-muted-foreground font-normal">({g.items.length})</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {g.items.map((iss, i) => {
                const TIcon = trendIcon[iss.trend]
                const isRising = iss.trend === 'rising'
                return (
                  <Link
                    key={i}
                    href="/surveys"
                    className="group inline-flex items-center gap-1.5 text-xs text-foreground hover:text-primary transition-colors"
                  >
                    <span className="truncate">{iss.title}</span>
                    {isRising && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0 rounded border border-rose-500/40 text-rose-600 dark:text-rose-400 text-[10px] shrink-0">
                        <TIcon className="h-2.5 w-2.5" />
                        惡化中
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
