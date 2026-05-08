'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Sparkles, Loader2, RefreshCw, GitCompare, MessagesSquare, ClipboardCheck } from 'lucide-react'
import type { TopicAlignmentSnapshot } from '@/lib/topic-alignment-store'
import { useElapsed } from '@/lib/useElapsed'

export function TopicAlignmentCard() {
  const [snapshot, setSnapshot] = useState<TopicAlignmentSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [usedMock, setUsedMock] = useState(false)
  const elapsed = useElapsed(running)

  useEffect(() => {
    fetch('/api/insights/topic-alignment')
      .then(r => r.json())
      .then(d => setSnapshot(d.snapshot ?? null))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function regenerate() {
    setRunning(true)
    setError(null)
    try {
      const res = await fetch('/api/insights/topic-alignment', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? '產生失敗')
      } else {
        setSnapshot(data.snapshot)
        setUsedMock(Boolean(data.usedMockSocial))
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between flex-wrap gap-2 pb-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <GitCompare className="h-4 w-4 text-primary" />
            社群 ↔ 問卷議題對齊
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            把問卷議題與社群討論做主題比對：哪些雙方都熱、哪些只在一邊
            {snapshot && (
              <span className="ml-1.5">
                ・ {snapshot.month} ・ {new Date(snapshot.generatedAt).toLocaleString('zh-TW')}
              </span>
            )}
          </p>
        </div>
        <Button
          size="sm"
          variant={snapshot ? 'outline' : 'default'}
          onClick={regenerate}
          disabled={running}
        >
          {running ? (
            <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Pro 深度分析中{elapsed > 0 ? ` (${elapsed}s)` : ''}</>
          ) : snapshot ? (
            <><RefreshCw className="h-3.5 w-3.5 mr-1.5" />重新分析</>
          ) : (
            <><Sparkles className="h-3.5 w-3.5 mr-1.5" />產生對齊</>
          )}
        </Button>
      </CardHeader>
      <CardContent>
        {error && <p className="text-xs text-destructive mb-3">{error}</p>}
        {running && (
          <p className="text-xs text-muted-foreground mb-3">
            Gemini 2.5 Pro 正在比對問卷議題與社群討論，預計 10–30 秒。
          </p>
        )}
        {usedMock && <p className="text-[11px] text-amber-600 mb-3">⚠ 社群尚未抓取真實資料，目前使用範例資料對比</p>}
        {loading ? (
          <p className="text-xs text-muted-foreground text-center py-6">載入中...</p>
        ) : !snapshot ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            尚未產生對齊，點右上「產生對齊」啟動（耗 1 份 Gemini 配額）
          </p>
        ) : (
          <div className="space-y-4">
            {snapshot.summary && (
              <div className="border-l-2 border-primary/40 bg-accent/20 rounded-r px-3 py-2">
                <p className="text-sm">{snapshot.summary}</p>
              </div>
            )}

            <div className="grid lg:grid-cols-3 gap-3">
              <AlignmentColumn
                icon={<GitCompare className="h-3.5 w-3.5 text-emerald-600" />}
                title="兩邊都熱（重疊議題）"
                count={snapshot.overlapping.length}
                empty="無重疊主題"
                tone="emerald"
              >
                {snapshot.overlapping.map((it, i) => (
                  <div key={i} className="border rounded-md p-2.5 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-1">
                    <div className="text-sm font-medium">{it.topic}</div>
                    {it.surveyEvidence && (
                      <div className="text-[11px] text-muted-foreground flex gap-1.5 items-start">
                        <ClipboardCheck className="h-3 w-3 mt-0.5 shrink-0 text-sky-600" />
                        <span>{it.surveyEvidence}</span>
                      </div>
                    )}
                    {it.socialEvidence && (
                      <div className="text-[11px] text-muted-foreground flex gap-1.5 items-start">
                        <MessagesSquare className="h-3 w-3 mt-0.5 shrink-0 text-violet-600" />
                        <span>{it.socialEvidence}</span>
                      </div>
                    )}
                  </div>
                ))}
              </AlignmentColumn>

              <AlignmentColumn
                icon={<MessagesSquare className="h-3.5 w-3.5 text-violet-600" />}
                title="只在社群（問卷選項缺）"
                count={snapshot.socialOnly.length}
                empty="社群無獨有議題"
                tone="violet"
              >
                {snapshot.socialOnly.map((it, i) => (
                  <div key={i} className="border rounded-md p-2.5 bg-violet-50/40 dark:bg-violet-950/20 space-y-1">
                    <div className="text-sm font-medium">{it.topic}</div>
                    <div className="text-[11px] text-muted-foreground">{it.evidence}</div>
                  </div>
                ))}
              </AlignmentColumn>

              <AlignmentColumn
                icon={<ClipboardCheck className="h-3.5 w-3.5 text-sky-600" />}
                title="只在問卷（私下抱怨）"
                count={snapshot.surveyOnly.length}
                empty="問卷無獨有議題"
                tone="sky"
              >
                {snapshot.surveyOnly.map((it, i) => (
                  <div key={i} className="border rounded-md p-2.5 bg-sky-50/40 dark:bg-sky-950/20 space-y-1">
                    <div className="text-sm font-medium">{it.topic}</div>
                    <div className="text-[11px] text-muted-foreground">{it.evidence}</div>
                  </div>
                ))}
              </AlignmentColumn>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function AlignmentColumn({
  icon,
  title,
  count,
  empty,
  children,
}: {
  icon: React.ReactNode
  title: string
  count: number
  empty: string
  tone: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold flex items-center gap-1.5">
          {icon}
          {title}
        </span>
        <Badge variant="secondary" className="text-[10px]">{count}</Badge>
      </div>
      {count === 0 ? (
        <p className="text-[11px] text-muted-foreground italic">{empty}</p>
      ) : (
        <div className="space-y-2">{children}</div>
      )}
    </div>
  )
}
