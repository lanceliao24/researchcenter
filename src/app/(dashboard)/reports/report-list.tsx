'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import {
  Eye,
  Search,
  Sparkles,
  Loader2,
  Trash2,
  Edit3,
  Check,
  X,
  FileText,
  Presentation,
  File,
  Cloud,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import { PERSONA_CATEGORIES, type Document, type PersonaCategory } from '@/types'

interface ReportListProps {
  documents: Document[]
  isLocal: boolean
}

interface ReportMeta {
  category?: PersonaCategory | string
  tags?: string[]
  summary?: string
  pages?: number
  slides?: number
  mime?: string
  size?: number
}

interface Recommendation {
  id: number
  title: string
  category: string
  tags: string[]
  summary: string
  reason: string
}

type CategoryFilter = 'all' | PersonaCategory

const CATEGORY_FILTERS: { value: CategoryFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  ...PERSONA_CATEGORIES.map(c => ({ value: c, label: c })),
]

function getMeta(doc: Document): ReportMeta {
  return (doc.metadata ?? {}) as ReportMeta
}

function iconFor(title: string) {
  const lower = title.toLowerCase()
  if (lower.endsWith('.pdf')) return <FileText className="h-4 w-4" />
  if (lower.endsWith('.pptx')) return <Presentation className="h-4 w-4" />
  return <File className="h-4 w-4" />
}

export function ReportList({ documents, isLocal }: ReportListProps) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [activeTag, setActiveTag] = useState<string | null>(null)

  const [recQuery, setRecQuery] = useState('')
  const [recLoading, setRecLoading] = useState(false)
  const [recResults, setRecResults] = useState<Recommendation[] | null>(null)
  const [recError, setRecError] = useState<string | null>(null)

  const [previewDoc, setPreviewDoc] = useState<Document | null>(null)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)

  const allTags = useMemo(() => {
    const set = new Set<string>()
    for (const d of documents) {
      const tags = getMeta(d).tags ?? []
      for (const t of tags) set.add(t)
    }
    return Array.from(set).sort()
  }, [documents])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return documents.filter(d => {
      const meta = getMeta(d)
      if (categoryFilter !== 'all' && meta.category !== categoryFilter) return false
      if (activeTag && !(meta.tags ?? []).includes(activeTag)) return false
      if (q) {
        const hay = [d.title, meta.summary ?? '', ...(meta.tags ?? [])]
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [documents, search, categoryFilter, activeTag])

  async function runRecommendation() {
    const q = recQuery.trim()
    if (!q) return
    setRecLoading(true)
    setRecError(null)
    setRecResults(null)
    try {
      const res = await fetch('/api/reports/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      })
      const data = await res.json()
      if (!res.ok) {
        setRecError(data.error ?? '推薦失敗')
      } else {
        setRecResults(data.recommendations ?? [])
      }
    } catch (err) {
      setRecError((err as Error).message)
    } finally {
      setRecLoading(false)
    }
  }

  async function deleteDoc(doc: Document) {
    if (!confirm(`確定刪除「${doc.title}」？`)) return
    setDeleting(doc.id)
    try {
      const res = await fetch(`/api/documents?id=${doc.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data.error ?? '刪除失敗')
      } else {
        router.refresh()
      }
    } catch (err) {
      alert((err as Error).message)
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="space-y-6">
      <DriveImportBlock isLocal={isLocal} onImported={() => router.refresh()} />

      <AiRecommendBlock
        query={recQuery}
        onChange={setRecQuery}
        onSubmit={runRecommendation}
        loading={recLoading}
        error={recError}
        results={recResults}
        onClear={() => {
          setRecQuery('')
          setRecResults(null)
          setRecError(null)
        }}
        onOpenPreview={id => {
          const doc = documents.find(d => d.id === id)
          if (doc) setPreviewDoc(doc)
        }}
      />

      <div className="flex flex-col gap-3">
        <Tabs value={categoryFilter} onValueChange={v => setCategoryFilter(v as CategoryFilter)}>
          <TabsList>
            {CATEGORY_FILTERS.map(f => (
              <TabsTrigger key={f.value} value={f.value}>
                {f.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="搜尋標題、摘要或標籤..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-9 text-sm"
            />
          </div>
          {(activeTag || search || categoryFilter !== 'all') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('')
                setActiveTag(null)
                setCategoryFilter('all')
              }}
            >
              清除篩選
            </Button>
          )}
        </div>

        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {allTags.map(tag => (
              <Badge
                key={tag}
                variant={activeTag === tag ? 'default' : 'outline'}
                className="cursor-pointer text-xs"
                onClick={() => setActiveTag(activeTag === tag ? null : tag)}
              >
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-3">
        {filtered.length > 0 ? (
          filtered.map(doc => (
            <ReportCard
              key={doc.id}
              doc={doc}
              isLocal={isLocal}
              editing={editingId === doc.id}
              onStartEdit={() => setEditingId(doc.id)}
              onCancelEdit={() => setEditingId(null)}
              onSaved={() => {
                setEditingId(null)
                router.refresh()
              }}
              onPreview={() => setPreviewDoc(doc)}
              onDelete={() => deleteDoc(doc)}
              deleting={deleting === doc.id}
            />
          ))
        ) : (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-sm text-muted-foreground">
                {documents.length === 0 ? '尚無研究報告，請上傳檔案' : '沒有符合篩選條件的報告'}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <PreviewDialog doc={previewDoc} onClose={() => setPreviewDoc(null)} />
    </div>
  )
}

function AiRecommendBlock({
  query,
  onChange,
  onSubmit,
  loading,
  error,
  results,
  onClear,
  onOpenPreview,
}: {
  query: string
  onChange: (v: string) => void
  onSubmit: () => void
  loading: boolean
  error: string | null
  results: Recommendation[] | null
  onClear: () => void
  onOpenPreview: (id: number) => void
}) {
  return (
    <Card className="bg-primary/5 border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          AI 報告推薦
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          描述你想研究的主題，AI 從所有報告中挑出最適合的 3~5 份（耗 1 份額度）
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            placeholder="例：想了解女性租車用戶的痛點 / 找競品分析 / 機車共享的 2024 Q4 觀察"
            value={query}
            onChange={e => onChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !loading) onSubmit()
            }}
            className="text-sm"
          />
          <Button onClick={onSubmit} disabled={loading || !query.trim()} size="sm">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            推薦
          </Button>
          {results && (
            <Button variant="ghost" size="sm" onClick={onClear}>
              清除
            </Button>
          )}
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        {results && results.length === 0 && (
          <p className="text-xs text-muted-foreground">AI 沒有找到合適的報告</p>
        )}
        {results && results.length > 0 && (
          <div className="space-y-2">
            {results.map((r, i) => (
              <div
                key={r.id}
                className="border rounded-md p-3 bg-background flex items-start gap-3"
              >
                <span className="text-[10px] font-bold text-primary shrink-0 mt-0.5">
                  #{i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium truncate">{r.title}</span>
                    {r.category && r.category !== '未分類' && (
                      <Badge variant="secondary" className="text-[10px]">
                        {r.category}
                      </Badge>
                    )}
                  </div>
                  {r.summary && (
                    <p className="text-xs text-muted-foreground mt-0.5">{r.summary}</p>
                  )}
                  <p className="text-xs text-primary mt-1">💡 {r.reason}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onOpenPreview(r.id)}
                  className="shrink-0"
                >
                  <Eye className="h-3.5 w-3.5 mr-1" />
                  預覽
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ReportCard({
  doc,
  isLocal,
  editing,
  onStartEdit,
  onCancelEdit,
  onSaved,
  onPreview,
  onDelete,
  deleting,
}: {
  doc: Document
  isLocal: boolean
  editing: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onSaved: () => void
  onPreview: () => void
  onDelete: () => void
  deleting: boolean
}) {
  const meta = getMeta(doc)
  const canPreview = isLocal && doc.file_path?.startsWith('/api/files/')
  const canEdit = isLocal && doc.file_path?.startsWith('/api/files/')

  return (
    <Card>
      <CardHeader className="py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0 flex-1">
            <div className="text-muted-foreground mt-1 shrink-0">{iconFor(doc.title)}</div>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-sm font-medium truncate">{doc.title}</CardTitle>
              {meta.summary && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{meta.summary}</p>
              )}
              <div className="flex items-center gap-1.5 flex-wrap mt-2">
                {meta.category && (
                  <Badge variant="default" className="text-[10px]">
                    {meta.category}
                  </Badge>
                )}
                {(meta.tags ?? []).map(t => (
                  <Badge key={t} variant="outline" className="text-[10px]">
                    {t}
                  </Badge>
                ))}
                {meta.pages && (
                  <span className="text-[10px] text-muted-foreground ml-1">
                    {meta.pages} 頁
                  </span>
                )}
                {meta.slides && (
                  <span className="text-[10px] text-muted-foreground ml-1">
                    {meta.slides} 張投影片
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {canPreview && (
              <Button variant="ghost" size="sm" onClick={onPreview} className="h-8 px-2 text-xs">
                <Eye className="h-3.5 w-3.5 mr-1" />
                預覽
              </Button>
            )}
            {canEdit && !editing && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onStartEdit}
                className="h-8 w-8 p-0"
                title="編輯分類/標籤"
              >
                <Edit3 className="h-3.5 w-3.5" />
              </Button>
            )}
            {canEdit && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onDelete}
                disabled={deleting}
                className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                title="刪除"
              >
                {deleting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      {editing && (
        <CardContent className="pt-0 pb-3">
          <MetaEditor doc={doc} onCancel={onCancelEdit} onSaved={onSaved} />
        </CardContent>
      )}
    </Card>
  )
}

function MetaEditor({
  doc,
  onCancel,
  onSaved,
}: {
  doc: Document
  onCancel: () => void
  onSaved: () => void
}) {
  const meta = getMeta(doc)
  const [category, setCategory] = useState<PersonaCategory>(
    (meta.category as PersonaCategory) && PERSONA_CATEGORIES.includes(meta.category as PersonaCategory)
      ? (meta.category as PersonaCategory)
      : '其他',
  )
  const [tagsInput, setTagsInput] = useState((meta.tags ?? []).join(', '))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const tags = tagsInput
        .split(/[,，、]/)
        .map(t => t.trim())
        .filter(Boolean)
      const res = await fetch('/api/documents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: doc.id, category, tags }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? '更新失敗')
      } else {
        onSaved()
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2 border rounded-md p-3 bg-muted/20">
      <div>
        <label className="text-xs font-medium text-muted-foreground">分類</label>
        <div className="flex gap-1.5 mt-1">
          {PERSONA_CATEGORIES.map(c => (
            <Button
              key={c}
              size="sm"
              variant={category === c ? 'default' : 'outline'}
              onClick={() => setCategory(c)}
              className="h-7 text-xs"
            >
              {c}
            </Button>
          ))}
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground">
          標籤（用逗號、頓號分隔）
        </label>
        <Input
          value={tagsInput}
          onChange={e => setTagsInput(e.target.value)}
          placeholder="例：女性用戶, 痛點分析, 2025Q4"
          className="mt-1 h-8 text-sm"
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
          <X className="h-3.5 w-3.5 mr-1" />
          取消
        </Button>
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5 mr-1" />
          )}
          儲存
        </Button>
      </div>
    </div>
  )
}

function PreviewDialog({ doc, onClose }: { doc: Document | null; onClose: () => void }) {
  return (
    <Dialog open={!!doc} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-5xl w-[90vw] h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-3 border-b">
          <DialogTitle className="text-sm font-medium truncate">
            {doc?.title ?? ''}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-hidden">
          {doc && <PreviewBody doc={doc} />}
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface PdfPayload { type: 'pdf'; url: string; pages: number | null }
interface PptxPayload { type: 'pptx'; slides: string[]; totalSlides: number }
interface TextPayload { type: 'text'; content: string; totalLength: number }
type PreviewPayload = PdfPayload | PptxPayload | TextPayload | { type: 'error'; error: string }

function PreviewBody({ doc }: { doc: Document }) {
  const [payload, setPayload] = useState<PreviewPayload | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setPayload(null)
    fetch(`/api/documents/preview?id=${doc.id}`)
      .then(async res => {
        const data = await res.json()
        if (cancelled) return
        if (!res.ok) {
          setPayload({ type: 'error', error: data.error ?? '載入失敗' })
        } else {
          setPayload(data as PreviewPayload)
        }
      })
      .catch(err => {
        if (!cancelled) setPayload({ type: 'error', error: (err as Error).message })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [doc.id])

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!payload || payload.type === 'error') {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-muted-foreground">
          {payload?.type === 'error' ? payload.error : '無法載入預覽'}
        </p>
      </div>
    )
  }

  if (payload.type === 'pdf') {
    return <iframe src={payload.url} className="w-full h-full" title={doc.title} />
  }

  if (payload.type === 'pptx') {
    return (
      <div className="h-full overflow-y-auto p-6 space-y-4">
        {payload.slides.map((text, i) => (
          <div key={i} className="border rounded-md p-4 bg-background">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-primary">投影片 #{i + 1}</span>
              <span className="text-[10px] text-muted-foreground">
                {i + 1} / {payload.totalSlides}
              </span>
            </div>
            <p className="text-sm whitespace-pre-wrap leading-relaxed">
              {text || <span className="text-muted-foreground italic">（此頁無文字內容）</span>}
            </p>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed">
        {payload.content}
      </pre>
      {payload.totalLength > payload.content.length && (
        <p className="text-xs text-muted-foreground text-center mt-4">
          僅顯示前 {payload.content.length.toLocaleString()} / {payload.totalLength.toLocaleString()} 字
        </p>
      )}
    </div>
  )
}

interface DriveResult {
  url: string
  ok: boolean
  doc?: { id: number; title: string }
  error?: string
}

function DriveImportBlock({
  isLocal,
  onImported,
}: {
  isLocal: boolean
  onImported: () => void
}) {
  const [open, setOpen] = useState(false)
  const [urls, setUrls] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<DriveResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!isLocal) return null

  async function runImport() {
    const list = urls
      .split('\n')
      .map(u => u.trim())
      .filter(Boolean)
    if (list.length === 0) return
    setLoading(true)
    setError(null)
    setResults(null)
    try {
      const res = await fetch('/api/reports/import-drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: list }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? '匯入失敗')
      } else {
        setResults(data.results ?? [])
        if ((data.imported ?? 0) > 0) onImported()
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader
        className="py-3 cursor-pointer select-none"
        onClick={() => setOpen(v => !v)}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Cloud className="h-4 w-4 text-primary" />
            從 Google Drive 匯入
          </CardTitle>
          {open ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </CardHeader>
      {open && (
        <CardContent className="space-y-3">
          <div className="text-xs text-muted-foreground space-y-1">
            <p>一行貼一個 Drive 連結，支援 PDF、PPTX、Google Docs、Google Slides。</p>
            <p>
              前提：檔案已設為「任何人有連結可檢視」，且
              <code className="mx-1 px-1 bg-muted rounded">.env.local</code>
              已填入 <code className="mx-1 px-1 bg-muted rounded">GOOGLE_DRIVE_API_KEY</code>。
            </p>
          </div>
          <Textarea
            value={urls}
            onChange={e => setUrls(e.target.value)}
            placeholder={'https://drive.google.com/file/d/xxx/view\nhttps://docs.google.com/document/d/yyy/edit'}
            rows={4}
            className="text-xs font-mono"
          />
          <div className="flex justify-end gap-2">
            {results && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setResults(null)
                  setError(null)
                  setUrls('')
                }}
              >
                清除
              </Button>
            )}
            <Button onClick={runImport} disabled={loading || !urls.trim()} size="sm">
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Cloud className="h-3.5 w-3.5 mr-1.5" />
              )}
              匯入並分析
            </Button>
          </div>
          {error && (
            <div className="text-xs text-destructive border rounded-md p-2 bg-destructive/5">
              {error}
            </div>
          )}
          {results && (
            <div className="space-y-1.5 border rounded-md p-2 bg-muted/20">
              <p className="text-xs font-medium">
                結果：{results.filter(r => r.ok).length} / {results.length} 成功
              </p>
              {results.map((r, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  {r.ok ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-muted-foreground">{r.url}</div>
                    {r.ok ? (
                      <div className="text-green-700">✓ {r.doc?.title}</div>
                    ) : (
                      <div className="text-destructive">✗ {r.error}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}
