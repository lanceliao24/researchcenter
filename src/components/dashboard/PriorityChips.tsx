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
    <div className="rounded-lg border border-rose-300 dark:border-rose-900 bg-rose-50/40 dark:bg-rose-950/15 px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <AlertOctagon className="h-4 w-4 text-rose-600 dark:text-rose-400" />
          <span className="text-sm font-semibold">本期最該處理</span>
          <span className="text-xs text-muted-foreground">（{issues.length} 個 prioritize 議題）</span>
        </div>
        <Link
          href="/surveys"
          className="text-xs text-rose-700 dark:text-rose-400 hover:underline font-medium inline-flex items-center gap-0.5"
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
              className={`group inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                isRising
                  ? 'border-rose-500 bg-rose-100/60 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 hover:bg-rose-200/60'
                  : 'border-amber-400 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 hover:bg-amber-100'
              }`}
            >
              <span className="text-[10px] uppercase tracking-wider opacity-70">{iss.serviceLabel}</span>
              <span className="opacity-30">·</span>
              <span>{iss.title}</span>
              {isRising && (
                <span className="inline-flex items-center gap-0.5 text-rose-700 dark:text-rose-400">
                  <TIcon className="h-3 w-3" />
                  <span className="text-[10px]">惡化中</span>
                </span>
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
