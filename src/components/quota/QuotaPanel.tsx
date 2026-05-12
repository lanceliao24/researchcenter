'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Activity, Loader2 } from 'lucide-react'

type QuotaKey = 'gemini_chat' | 'gemini_chat_pro' | 'gemini_embedding' | 'firecrawl_search'

interface QuotaSlice {
  used: number
  limit: number
  remaining: number
  date: string
}

interface QuotaRow {
  key: QuotaKey
  global: QuotaSlice
  personal: QuotaSlice
}

interface QuotaResponse {
  email: string
  role: 'editor' | 'viewer'
  quotas: QuotaRow[]
}

const META: Record<QuotaKey, { label: string; sub: string; color: string }> = {
  gemini_chat: {
    label: 'AI 問答',
    sub: 'Flash 模型',
    color: 'bg-sky-500',
  },
  gemini_chat_pro: {
    label: 'AI 深度分析',
    sub: 'Pro 模型（editor only）',
    color: 'bg-violet-500',
  },
  gemini_embedding: {
    label: '向量索引',
    sub: 'Embedding',
    color: 'bg-emerald-500',
  },
  firecrawl_search: {
    label: '社群爬取',
    sub: 'Firecrawl',
    color: 'bg-amber-500',
  },
}

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
    fetch('/api/quota/me')
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
          {data && (
            <Badge variant="outline" className="text-[10px] ml-1">
              {data.role}
            </Badge>
          )}
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
            {data.quotas.map(q => {
              const m = META[q.key]
              const personalCapped = q.personal.limit === 0
              return (
                <div key={q.key} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium">{m.label}</span>
                      <span className="text-[10px] text-muted-foreground">{m.sub}</span>
                    </div>
                    <span className="tabular-nums text-muted-foreground">
                      {personalCapped ? (
                        <span className="text-rose-600 dark:text-rose-400">無權限</span>
                      ) : (
                        <>
                          <span className="font-medium text-foreground">{q.personal.used}</span>
                          <span> / {q.personal.limit}</span>
                        </>
                      )}
                    </span>
                  </div>
                  {!personalCapped && <Bar slice={q.personal} color={m.color} />}
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground/80">
                    <span>個人</span>
                    <span>
                      全站 <span className="tabular-nums">{q.global.used}/{q.global.limit}</span>
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
