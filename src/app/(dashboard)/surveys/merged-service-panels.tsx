'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RefreshCw, Loader2 } from 'lucide-react'
import type { IssueTrendsSnapshot, ServiceTrends } from '@/lib/issue-trends-store'
import type { CounterInsightsSnapshot, ServiceCounterInsights } from '@/lib/counter-insights-store'
import { ServiceTrendsBody } from './issue-trends'
import { ServiceContradictionsBody } from './counter-insights'

type Tab = 'trends' | 'contradictions'

function MergedServiceBlock({
  service,
  trends,
  contradictions,
  busy,
  onRegenerate,
}: {
  service: string
  trends?: ServiceTrends
  contradictions?: ServiceCounterInsights
  busy: Tab | null
  onRegenerate: (service: string, tab: Tab) => void
}) {
  const defaultTab: Tab = trends ? 'trends' : 'contradictions'
  const [tab, setTab] = useState<Tab>(defaultTab)
  const label = trends?.serviceLabel ?? contradictions?.serviceLabel ?? service

  return (
    <div id={`service-${service}`} className="border rounded-lg bg-card scroll-mt-20">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30 gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{label}</span>
          <Badge variant="outline" className="text-[10px]">{service}</Badge>
          {tab === 'trends' && trends && (
            <span className="text-xs text-muted-foreground">
              {trends.issues.length} 議題 · {trends.rawCount} 筆 raw · 跨 {trends.periods.length} 期 ({trends.periods.join(' → ')})
            </span>
          )}
          {tab === 'contradictions' && contradictions && (
            <span className="text-xs text-muted-foreground">
              {contradictions.month} ・ Promoter {contradictions.promoterCount} / Detractor {contradictions.detractorCount}
            </span>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={() => onRegenerate(service, tab)}
          disabled={busy !== null || (tab === 'trends' ? !trends : !contradictions)}
        >
          {busy === tab ? (
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3 mr-1" />
          )}
          只重跑這個
        </Button>
      </div>

      <div className="p-3 pb-0">
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList className="w-full">
            <TabsTrigger value="trends" disabled={!trends}>
              跨問卷議題趨勢
            </TabsTrigger>
            <TabsTrigger value="contradictions" disabled={!contradictions}>
              Promoter ↔ Detractor 矛盾
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {tab === 'trends' && trends && <ServiceTrendsBody trends={trends} />}
      {tab === 'trends' && !trends && (
        <p className="text-xs text-muted-foreground text-center py-6 px-3">此服務尚無議題趨勢分析</p>
      )}
      {tab === 'contradictions' && contradictions && <ServiceContradictionsBody data={contradictions} />}
      {tab === 'contradictions' && !contradictions && (
        <p className="text-xs text-muted-foreground text-center py-6 px-3">此服務尚無矛盾分析</p>
      )}
    </div>
  )
}

export function MergedServicePanels({ refreshKey = 0 }: { refreshKey?: number } = {}) {
  const [trendsSnap, setTrendsSnap] = useState<IssueTrendsSnapshot | null>(null)
  const [counterSnap, setCounterSnap] = useState<CounterInsightsSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<{ service: string; tab: Tab } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const [tRes, cRes] = await Promise.all([
          fetch('/api/surveys/issue-trends').then(r => r.json()).catch(() => ({})),
          fetch('/api/surveys/counter-insights').then(r => r.json()).catch(() => ({})),
        ])
        if (cancelled) return
        setTrendsSnap(tRes?.snapshot && Array.isArray(tRes.snapshot.byService) ? tRes.snapshot : null)
        setCounterSnap(cRes?.snapshot ?? null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [refreshKey])

  // Browser's auto hash-scroll fires before our async data renders the
  // anchor target. After the first paint with data, re-resolve the hash
  // and scroll the matching block into view.
  useEffect(() => {
    if (loading) return
    if (typeof window === 'undefined') return
    const hash = window.location.hash
    if (!hash || !hash.startsWith('#service-')) return
    const el = document.getElementById(hash.slice(1))
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [loading])

  async function regenerate(service: string, tab: Tab) {
    setBusy({ service, tab })
    setError(null)
    try {
      const url = tab === 'trends' ? '/api/surveys/issue-trends' : '/api/surveys/counter-insights'
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? '產生失敗')
      } else if (tab === 'trends') {
        setTrendsSnap(data.snapshot)
      } else {
        setCounterSnap(data.snapshot)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return <p className="text-xs text-muted-foreground text-center py-6">載入服務分析中...</p>
  }

  // Build union of services from both snapshots, ordered by trendsSnap first.
  const services: { id: string }[] = []
  const seen = new Set<string>()
  if (trendsSnap) {
    for (const s of trendsSnap.byService) {
      if (!seen.has(s.service)) { services.push({ id: s.service }); seen.add(s.service) }
    }
  }
  if (counterSnap) {
    for (const s of counterSnap.byService) {
      if (!seen.has(s.service)) { services.push({ id: s.service }); seen.add(s.service) }
    }
  }

  if (services.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-6">
        尚未產生任何服務分析，使用上方卡片啟動「產生議題趨勢」或「產生矛盾分析」
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-xs text-destructive">{error}</p>}
      {services.map(({ id }) => {
        const trends = trendsSnap?.byService.find(s => s.service === id)
        const contradictions = counterSnap?.byService.find(s => s.service === id)
        const blockBusy = busy?.service === id ? busy.tab : null
        return (
          <MergedServiceBlock
            key={id}
            service={id}
            trends={trends}
            contradictions={contradictions}
            busy={blockBusy}
            onRegenerate={regenerate}
          />
        )
      })}
    </div>
  )
}
