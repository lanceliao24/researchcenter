'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Activity, Loader2 } from 'lucide-react'

type QuotaKey = 'gemini_chat' | 'gemini_chat_pro' | 'gemini_embedding' | 'firecrawl_search'

interface QuotaSlice {
  used: number
  limit: number
  remaining: number
  date: string
}

type QuotaResponse = Partial<Record<QuotaKey, QuotaSlice>>

const META: Record<QuotaKey, { label: string; sub: string; color: string }> = {
  gemini_chat: { label: 'AI 問答', sub: 'Flash 模型', color: 'bg-sky-500' },
  gemini_chat_pro: { label: 'AI 深度分析', sub: 'Pro 模型', color: 'bg-violet-500' },
  gemini_embedding: { label: '向量索引', sub: 'Embedding', color: 'bg-emerald-500' },
  firecrawl_search: { label: '社群爬取', sub: 'Firecrawl', color: 'bg-amber-500' },
}

const KEYS: QuotaKey[] = ['gemini_chat', 'gemini_chat_pro', 'gemini_embedding', 'firecrawl_search']

function Bar({ slice, color }: { slice: QuotaSlice; color: string }) {
  const pct = slice.limit > 0 ? Math.min(100, (slice.used / slice.limit) * 100) : 0
  const tone = pct >= 90 ? 'bg-rose-500' : pct >= 60 ? 'bg-amber-500' : color
  return (
    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
      <div className={`h-full ${tone} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function QuotaPanel() {
  const [data, setData] = useState<QuotaResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/quota')
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          今日 AI 配額
        </CardTitle>
        <p className="text-[11px] text-muted-foreground">每天 00:00 重置</p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : !data ? (
          <p className="text-xs text-muted-foreground text-center py-4">無法載入</p>
        ) : (
          <div className="space-y-3">
            {KEYS.map(key => {
              const slice = data[key]
              if (!slice) return null
              const m = META[key]
              return (
                <div key={key} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium">{m.label}</span>
                      <span className="text-[10px] text-muted-foreground">{m.sub}</span>
                    </div>
                    <span className="tabular-nums text-muted-foreground">
                      <span className="font-medium text-foreground">{slice.used}</span>
                      <span> / {slice.limit}</span>
                    </span>
                  </div>
                  <Bar slice={slice} color={m.color} />
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
