'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { History, RefreshCw, Loader2, ShieldAlert } from 'lucide-react'

interface AuditEvent {
  ts: string
  email: string
  role: string
  action: string
  resource: string | null
  details?: Record<string, unknown>
}

const ACTION_LABELS: Record<string, string> = {
  'upload.create': '上傳檔案',
  'document.update': '更新文件',
  'document.delete': '刪除文件',
  'persona.delete': '刪除 persona',
  'persona.generate': '生成 persona',
  'persona.reindex': '重新索引 persona',
  'persona.reindex_all': '全部重新索引',
  'keyword.add': '新增關鍵字',
  'keyword.delete': '刪除關鍵字',
  'keyword.toggle': '切換關鍵字',
  'report.import_drive': '從 Drive 匯入',
  'rag.index': '索引文件',
  'rag.index_all': '全部索引',
  'rag.index_reset': '清空索引',
  'social.fetch': '社群抓取',
  'survey.monthly_import': '匯入月度問卷',
  'survey.issue_trends': '生成議題趨勢',
  'wiki.ingest': '匯入 Wiki',
  'embed.create': '建立 embedding',
}

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action
}

export default function AuditLogPage() {
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterEmail, setFilterEmail] = useState('')
  const [filterAction, setFilterAction] = useState<string>('all')
  const [authError, setAuthError] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/audit-log?limit=300')
      if (res.status === 403) {
        setAuthError(true)
        return
      }
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? '載入失敗')
      } else {
        setEvents(Array.isArray(data.events) ? data.events : [])
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const actions = useMemo(() => {
    const s = new Set<string>()
    for (const e of events) s.add(e.action)
    return Array.from(s).sort()
  }, [events])

  const filtered = useMemo(() => {
    return events.filter(e => {
      if (filterEmail && !e.email.toLowerCase().includes(filterEmail.toLowerCase())) return false
      if (filterAction !== 'all' && e.action !== filterAction) return false
      return true
    })
  }, [events, filterEmail, filterAction])

  if (authError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <ShieldAlert className="h-12 w-12 text-amber-500" />
        <p className="text-base font-medium">需要 editor 權限</p>
        <p className="text-sm text-muted-foreground">此頁面只開放給 editor 角色</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <History className="h-6 w-6 text-primary" /> Audit Log
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            紀錄所有 editor 對資料的變更動作。檔案：<code className="text-xs">data/store/audit-log.ndjson</code>
          </p>
        </div>
        <Button onClick={load} size="sm" variant="outline" disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
          重新載入
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">事件列表</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex gap-2 flex-wrap items-center">
            <Input
              placeholder="篩選 email..."
              value={filterEmail}
              onChange={e => setFilterEmail(e.target.value)}
              className="h-8 max-w-[220px] text-xs"
            />
            <Select value={filterAction} onValueChange={v => setFilterAction(v ?? 'all')}>
              <SelectTrigger className="h-8 w-[200px] text-xs">
                <SelectValue placeholder="所有 action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">所有 action</SelectItem>
                {actions.map(a => (
                  <SelectItem key={a} value={a}>{actionLabel(a)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground ml-auto tabular-nums">
              {filtered.length} / {events.length} 筆
            </span>
          </div>

          {loading ? (
            <p className="text-xs text-muted-foreground text-center py-8">載入中...</p>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">
              {events.length === 0 ? '還沒有任何 audit 事件' : '沒有符合條件的事件'}
            </p>
          ) : (
            <div className="overflow-x-auto border rounded-md">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">時間</th>
                    <th className="px-3 py-2 text-left font-medium">帳號</th>
                    <th className="px-3 py-2 text-left font-medium">Action</th>
                    <th className="px-3 py-2 text-left font-medium">Resource</th>
                    <th className="px-3 py-2 text-left font-medium">細節</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((e, i) => (
                    <tr key={i} className="hover:bg-accent/20">
                      <td className="px-3 py-2 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                        {new Date(e.ts).toLocaleString('zh-TW', { hour12: false })}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs">
                        <div>{e.email}</div>
                        <Badge variant="outline" className="text-[9px] mt-0.5">{e.role}</Badge>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs">
                        <span className="font-medium">{actionLabel(e.action)}</span>
                        <div className="text-muted-foreground text-[10px] font-mono">{e.action}</div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs font-mono text-muted-foreground">
                        {e.resource ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {e.details ? (
                          <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap break-all max-w-[400px]">
                            {JSON.stringify(e.details, null, 0)}
                          </pre>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
