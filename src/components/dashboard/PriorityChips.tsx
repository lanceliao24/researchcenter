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

  // rising 排最前；其餘維持原序
  const sorted = [...issues].sort((a, b) => {
    if (a.trend === 'rising' && b.trend !== 'rising') return -1
    if (a.trend !== 'rising' && b.trend === 'rising') return 1
    return 0
  })

  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <div className="flex items-center justify-between mb-2">
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
      <div className="flex flex-wrap gap-2">
        {sorted.map((iss, i) => {
          const TIcon = trendIcon[iss.trend]
          const isRising = iss.trend === 'rising'
          return (
            <Link
              key={i}
              href="/surveys"
              className="group inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border bg-card hover:bg-accent text-foreground text-xs font-medium transition-colors"
            >
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{iss.serviceLabel}</span>
              <span className="text-muted-foreground/40">·</span>
              <span>{iss.title}</span>
              {isRising && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0 rounded border border-rose-500/40 text-rose-600 dark:text-rose-400 text-[10px]">
                  <TIcon className="h-2.5 w-2.5" />
                  惡化中
                </span>
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
