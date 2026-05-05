'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Eye, ChevronDown, ChevronUp, Sparkles, Loader2, RefreshCw, Quote, Trash2, Table2 } from 'lucide-react'
import type { Document } from '@/types'
import type { SurveySummary } from '@/lib/survey-summary-store'

interface CsvPreview {
  headers: string[]
  totalRows: number
  preview: Record<string, unknown>[]
}

interface SurveyListProps {
  documents: Document[]
  isLocal: boolean
}

export function SurveyList({ documents, isLocal }: SurveyListProps) {
  const router = useRouter()
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [previewData, setPreviewData] = useState<Record<number, CsvPreview>>({})
  const [loadingPreview, setLoadingPreview] = useState<number | null>(null)
  const [dataBlockOpen, setDataBlockOpen] = useState<Record<number, boolean>>({})
  const [summaries, setSummaries] = useState<Record<number, SurveySummary | null>>({})
  const [loadingSummary, setLoadingSummary] = useState<number | null>(null)
  const [summaryError, setSummaryError] = useState<Record<number, string>>({})
  const [deleting, setDeleting] = useState<number | null>(null)

  async function togglePreview(docId: number) {
    if (expandedId === docId) {
      setExpandedId(null)
      return
    }
    setExpandedId(docId)
    if (!previewData[docId]) await loadPreview(docId)
    if (summaries[docId] === undefined) await loadSummaryCache(docId)
  }

  async function loadPreview(docId: number) {
    setLoadingPreview(docId)
    try {
      const res = await fetch(`/api/documents/preview?id=${docId}`)
      if (res.ok) {
        const data = await res.json()
        if (data.type === 'csv') {
          setPreviewData(prev => ({ ...prev, [docId]: data }))
        }
      }
    } catch (err) {
      console.error('Preview fetch error:', err)
    } finally {
      setLoadingPreview(null)
    }
  }

  async function loadSummaryCache(docId: number) {
    try {
      const res = await fetch(`/api/surveys/${docId}/summary`)
      if (res.ok) {
        const data = await res.json()
        setSummaries(prev => ({ ...prev, [docId]: data.summary ?? null }))
      }
    } catch {
      setSummaries(prev => ({ ...prev, [docId]: null }))
    }
  }

  async function generateSummary(docId: number) {
    setLoadingSummary(docId)
    setSummaryError(prev => {
      const { [docId]: _removed, ...rest } = prev
      return rest
    })
    try {
      const res = await fetch(`/api/surveys/${docId}/summary`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setSummaryError(prev => ({ ...prev, [docId]: data.error ?? '產生失敗' }))
      } else {
        setSummaries(prev => ({ ...prev, [docId]: data.summary }))
      }
    } catch (err) {
      setSummaryError(prev => ({ ...prev, [docId]: (err as Error).message }))
    } finally {
      setLoadingSummary(null)
    }
  }

  async function deleteDoc(doc: Document) {
    if (!confirm(`確定刪除「${doc.title}」？檔案、預覽與 AI 摘要都會一併移除。`)) return
    setDeleting(doc.id)
    try {
      const res = await fetch(`/api/documents?id=${doc.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data.error ?? '刪除失敗')
      } else {
        if (expandedId === doc.id) setExpandedId(null)
        setPreviewData(prev => {
          const { [doc.id]: _, ...rest } = prev
          return rest
        })
        setSummaries(prev => {
          const { [doc.id]: _, ...rest } = prev
          return rest
        })
        router.refresh()
      }
    } catch (err) {
      alert((err as Error).message)
    } finally {
      setDeleting(null)
    }
  }

  const canPreview = (doc: Document) => isLocal && doc.file_path?.startsWith('/uploads/')
  const canDelete = (doc: Document) => isLocal && doc.file_path?.startsWith('/uploads/')

  return (
    <div className="grid gap-4">
      {documents.length > 0 ? (
        documents.map((doc) => (
          <Card key={doc.id}>
            <CardHeader className="flex flex-row items-center justify-between py-3">
              <CardTitle className="text-sm font-medium">{doc.title}</CardTitle>
              <div className="flex items-center gap-2">
                {canPreview(doc) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => togglePreview(doc.id)}
                    className="text-xs gap-1"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    預覽
                    {expandedId === doc.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </Button>
                )}
                <Badge variant={doc.status === 'ready' ? 'default' : 'secondary'}>
                  {doc.status === 'ready' ? '已匯入' : doc.status === 'processing' ? '處理中' : '錯誤'}
                </Badge>
                {canDelete(doc) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteDoc(doc)}
                    disabled={deleting === doc.id}
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    title="刪除"
                  >
                    {deleting === doc.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-xs text-muted-foreground">
                上傳時間：{new Date(doc.created_at).toLocaleString('zh-TW')}
                {typeof (doc.metadata as Record<string, unknown>)?.rows === 'number' && (
                  <span className="ml-2">
                    ・{((doc.metadata as Record<string, unknown>).rows as number).toLocaleString()} 筆資料
                  </span>
                )}
              </p>

              {expandedId === doc.id && (
                <div className="mt-4 space-y-4">
                  <SummaryBlock
                    summary={summaries[doc.id] ?? null}
                    loading={loadingSummary === doc.id}
                    error={summaryError[doc.id]}
                    onGenerate={() => generateSummary(doc.id)}
                  />

                  {loadingPreview === doc.id ? (
                    <p className="text-xs text-muted-foreground text-center py-4">載入預覽中...</p>
                  ) : previewData[doc.id] ? (
                    <div className="space-y-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setDataBlockOpen(prev => ({ ...prev, [doc.id]: !prev[doc.id] }))
                        }
                        className="w-full justify-between h-auto py-2 px-3 border rounded-md bg-muted/20 hover:bg-muted/40"
                      >
                        <span className="flex items-center gap-2 text-xs font-medium">
                          <Table2 className="h-3.5 w-3.5" />
                          資料欄位與前 {Math.min(10, previewData[doc.id].totalRows)} 筆
                          <span className="text-muted-foreground font-normal">
                            ・{previewData[doc.id].totalRows.toLocaleString()} 筆資料 ・ {previewData[doc.id].headers.length} 個欄位
                          </span>
                        </span>
                        {dataBlockOpen[doc.id] ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </Button>
                      {dataBlockOpen[doc.id] && (
                        <div className="space-y-3 pt-1">
                          <div className="flex gap-1.5 flex-wrap">
                            {previewData[doc.id].headers.map(h => (
                              <Badge key={h} variant="outline" className="text-xs font-mono">
                                {h}
                              </Badge>
                            ))}
                          </div>
                          <div className="overflow-x-auto border rounded-lg">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b bg-accent/50">
                                  {previewData[doc.id].headers.map(h => (
                                    <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">
                                      {h}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {previewData[doc.id].preview.map((row, i) => (
                                  <tr key={i} className="border-b last:border-0 hover:bg-accent/50">
                                    {previewData[doc.id].headers.map(h => (
                                      <td key={h} className="px-3 py-1.5 text-foreground whitespace-nowrap max-w-[200px] truncate">
                                        {String(row[h] ?? '')}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <p className="text-xs text-muted-foreground text-right">
                            顯示前 {Math.min(10, previewData[doc.id].totalRows)} 筆
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-4">無法載入預覽</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))
      ) : (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-muted-foreground">尚無問卷資料，請上傳 CSV 檔案</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function SummaryBlock({
  summary,
  loading,
  error,
  onGenerate,
}: {
  summary: SurveySummary | null
  loading: boolean
  error?: string
  onGenerate: () => void
}) {
  if (loading) {
    return (
      <div className="border rounded-md p-4 bg-muted/20">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          AI 正在歸納 Top 5 主題...
        </div>
      </div>
    )
  }

  if (!summary) {
    return (
      <div className="border rounded-md p-4 bg-muted/20 space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-semibold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              AI Top 5 主題摘要
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              自動抽取開放式欄位、隨機採樣 150 筆、用 Gemini Flash Lite 產出（耗 1 份額度）
            </p>
          </div>
          <Button onClick={onGenerate} size="sm">
            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
            產生摘要
          </Button>
        </div>
        {error && (
          <p className="text-xs text-destructive border-t pt-2">{error}</p>
        )}
      </div>
    )
  }

  return (
    <div className="border rounded-md p-4 space-y-3 bg-accent/10">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-sm font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Top 5 主題摘要
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            分析 {summary.sampledRows} / {summary.totalRows} 筆 · 欄位：{summary.openEndedColumns.join('、')}
            <span className="ml-2">· {new Date(summary.generatedAt).toLocaleString('zh-TW')}</span>
          </p>
        </div>
        <Button onClick={onGenerate} size="sm" variant="outline">
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          重新產生
        </Button>
      </div>

      <div className="space-y-2.5">
        {summary.themes.map((t, i) => (
          <div key={i} className="border rounded-sm bg-background p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] font-bold text-primary shrink-0">
                  #{i + 1}
                </span>
                <span className="text-sm font-semibold truncate">{t.title}</span>
              </div>
              <Badge variant="secondary" className="text-[10px] shrink-0">
                {t.frequency_estimate}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{t.description}</p>
            <div className="flex gap-2 items-start mt-2 text-xs italic text-muted-foreground border-l-2 border-primary/30 pl-2.5 py-0.5">
              <Quote className="h-3 w-3 shrink-0 mt-0.5 text-primary/50" />
              <div className="min-w-0">
                <div className="line-clamp-3">「{t.quote}」</div>
                {t.quote_source && (
                  <div className="text-[10px] text-muted-foreground/70 mt-0.5 not-italic">
                    — {t.quote_source}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
