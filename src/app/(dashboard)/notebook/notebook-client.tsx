'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  BookOpen, FileText, Search, ShieldCheck, ChevronRight,
  Loader2, ArrowLeft, Plus, Sparkles, CheckCircle2,
  AlertTriangle, Info, Send,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Document } from '@/types'

interface WikiPageSummary {
  slug: string
  title: string
  type: string
  updated: string
  tags?: string[]
}

interface LintIssue {
  type: string
  description: string
  pages: string[]
}

type View = 'home' | 'pages' | 'page-detail' | 'ingest' | 'query' | 'lint'

interface NotebookClientProps {
  documents: Document[]
  wikiPages: WikiPageSummary[]
  socialPostCount: number
}

export function NotebookClient({ documents, wikiPages: initialPages, socialPostCount }: NotebookClientProps) {
  const [view, setView] = useState<View>('home')
  const [wikiPages, setWikiPages] = useState(initialPages)
  const [currentPage, setCurrentPage] = useState<{ slug: string; content: string; meta: { title: string; type: string; updated: string; sources?: string[]; tags?: string[] } } | null>(null)
  const [pageLoading, setPageLoading] = useState(false)
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set())
  const [ingesting, setIngesting] = useState(false)
  const [ingestResult, setIngestResult] = useState<{ success: boolean; pages?: string[]; error?: string } | null>(null)
  const [queryText, setQueryText] = useState('')
  const [queryResult, setQueryResult] = useState<{
    answer: string
    citedPages: string[]
    suggestedFollowUps: string[]
  } | null>(null)
  const [querying, setQuerying] = useState(false)
  const [lintResult, setLintResult] = useState<{
    issues: LintIssue[]
    suggestions: string[]
    summary: string
  } | null>(null)
  const [linting, setLinting] = useState(false)

  // --- Actions ---

  const openPage = useCallback(async (slug: string) => {
    setPageLoading(true)
    setView('page-detail')
    try {
      const res = await fetch(`/api/wiki/pages?slug=${encodeURIComponent(slug)}`)
      if (res.ok) {
        const data = await res.json()
        setCurrentPage({ slug, content: data.page.content, meta: data.page.meta })
      }
    } catch (err) {
      console.error('Failed to load page:', err)
    } finally {
      setPageLoading(false)
    }
  }, [])

  const refreshPages = useCallback(async () => {
    try {
      const res = await fetch('/api/wiki/pages')
      if (res.ok) {
        const data = await res.json()
        setWikiPages(data.pages)
      }
    } catch (err) {
      console.error('Failed to refresh pages:', err)
    }
  }, [])

  const toggleSource = (key: string) => {
    setSelectedSources(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleIngest = async () => {
    if (selectedSources.size === 0) return
    setIngesting(true)
    setIngestResult(null)

    const allPages: string[] = []
    let lastError: string | undefined

    for (const key of selectedSources) {
      const [type, idStr] = key.split(':')
      let sourceTitle = ''
      let sourceContent = ''
      let sourceType = type
      const sourceId = idStr

      if (type === 'social') {
        sourceTitle = `社群貼文彙整 (${socialPostCount} 則)`
        sourceType = 'social'
        sourceContent = '（社群貼文資料由系統內建提供）'
      } else {
        const doc = documents.find(d => d.id === Number(idStr))
        if (!doc) continue
        sourceTitle = doc.title
        sourceType = doc.type
        if (doc.file_path) {
          try {
            const previewRes = await fetch(`/api/documents/preview?id=${doc.id}`)
            if (previewRes.ok) {
              const previewData = await previewRes.json()
              if (previewData.type === 'csv') {
                sourceContent = `CSV 資料：${previewData.totalRows} 筆\n欄位：${previewData.headers.join('、')}\n\n前 10 筆資料：\n${JSON.stringify(previewData.preview, null, 2)}`
              } else if (previewData.content) {
                sourceContent = previewData.content
              }
            }
          } catch {
            sourceContent = `（無法讀取檔案內容：${doc.title}）`
          }
        } else {
          sourceContent = `模擬資料：${doc.title}（類型：${doc.type}，狀態：${doc.status}）`
        }
      }

      try {
        const res = await fetch('/api/wiki/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sourceId, sourceType, sourceTitle, sourceContent }),
        })
        const data = await res.json()
        if (data.success) {
          allPages.push(...(data.pagesWritten || []))
        } else {
          lastError = data.error
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : 'Unknown error'
      }
    }

    setIngesting(false)
    setIngestResult({ success: allPages.length > 0, pages: allPages, error: lastError })
    if (allPages.length > 0) await refreshPages()
  }

  const handleQuery = async () => {
    if (!queryText.trim()) return
    setQuerying(true)
    setQueryResult(null)
    try {
      const res = await fetch('/api/wiki/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: queryText }),
      })
      const data = await res.json()
      setQueryResult(data)
    } catch (err) {
      console.error('Query error:', err)
    } finally {
      setQuerying(false)
    }
  }

  const handleLint = async () => {
    setLinting(true)
    setLintResult(null)
    try {
      const res = await fetch('/api/wiki/lint', { method: 'POST' })
      const data = await res.json()
      setLintResult(data)
    } catch (err) {
      console.error('Lint error:', err)
    } finally {
      setLinting(false)
    }
  }

  const typeLabel: Record<string, string> = { source: '來源', entity: '實體', topic: '主題', synthesis: '綜合' }

  // --- Wiki stats ---
  const sourceCount = wikiPages.filter(p => p.type === 'source').length
  const entityCount = wikiPages.filter(p => p.type === 'entity').length
  const topicCount = wikiPages.filter(p => p.type === 'topic').length
  const synthesisCount = wikiPages.filter(p => p.type === 'synthesis').length

  return (
    <div className="max-w-[600px]">
      {/* Back button for sub-views */}
      {view !== 'home' && (
        <div className="mb-4">
          <button
            onClick={() => setView('home')}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            返回
          </button>
        </div>
      )}

      {/* ===== HOME ===== */}
      {view === 'home' && (
        <>
          {/* Metrics row */}
          {wikiPages.length > 0 && (
            <div className="grid grid-cols-4 gap-px border-b pb-4 mb-2">
              <MetricCard label="來源" value={sourceCount} />
              <MetricCard label="實體" value={entityCount} />
              <MetricCard label="主題" value={topicCount} />
              <MetricCard label="綜合" value={synthesisCount} />
            </div>
          )}

          {wikiPages.length > 0 && (
            <p className="text-xs text-muted-foreground px-1 py-3 border-b">
              Wiki 共 {wikiPages.length} 個頁面
            </p>
          )}

          {/* Action list */}
          <div className="divide-y">
            <ListItem
              icon={<Plus className="h-5 w-5" />}
              title="匯入來源"
              subtitle="將研究資料加入 Wiki 知識庫"
              onClick={() => { setView('ingest'); setIngestResult(null); setSelectedSources(new Set()) }}
            />
            <ListItem
              icon={<Search className="h-5 w-5" />}
              title="查詢 Wiki"
              subtitle="向知識庫提問，AI 綜合回答"
              onClick={() => { setView('query'); setQueryResult(null); setQueryText('') }}
            />
            <ListItem
              icon={<BookOpen className="h-5 w-5" />}
              title="瀏覽頁面"
              subtitle={`查看所有 ${wikiPages.length} 個 Wiki 頁面`}
              onClick={() => setView('pages')}
            />
            <ListItem
              icon={<ShieldCheck className="h-5 w-5" />}
              title="健康檢查"
              subtitle="檢查 Wiki 一致性與完整度"
              onClick={() => { setView('lint'); setLintResult(null); handleLint() }}
            />
          </div>

          {/* Recent pages */}
          {wikiPages.length > 0 && (
            <div className="mt-6">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider px-1 mb-1">
                最近更新
              </h3>
              <div className="divide-y">
                {wikiPages
                  .sort((a, b) => (b.updated || '').localeCompare(a.updated || ''))
                  .slice(0, 6)
                  .map(page => (
                    <ListItem
                      key={page.slug}
                      icon={<FileText className="h-5 w-5" />}
                      title={page.title}
                      subtitle={page.slug}
                      badge={typeLabel[page.type]}
                      onClick={() => openPage(page.slug)}
                    />
                  ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {wikiPages.length === 0 && (
            <div className="text-center py-16">
              <Sparkles className="h-8 w-8 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-[15px] font-bold mb-1">Wiki 尚未建立</p>
              <p className="text-sm text-muted-foreground mb-6">
                點選「匯入來源」開始建構知識庫
              </p>
              <Button
                onClick={() => setView('ingest')}
                className="rounded-full px-6 font-bold"
              >
                開始匯入
              </Button>
            </div>
          )}
        </>
      )}

      {/* ===== PAGES ===== */}
      {view === 'pages' && (
        <>
          <h2 className="text-lg font-bold mb-4">Wiki 頁面</h2>
          {wikiPages.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              尚無頁面，請先匯入來源
            </p>
          ) : (
            (['source', 'entity', 'topic', 'synthesis'] as const).map(type => {
              const filtered = wikiPages.filter(p => p.type === type)
              if (filtered.length === 0) return null
              return (
                <div key={type} className="mb-6">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider px-1 mb-1">
                    {typeLabel[type]}（{filtered.length}）
                  </h3>
                  <div className="divide-y">
                    {filtered.map(page => (
                      <ListItem
                        key={page.slug}
                        icon={<FileText className="h-5 w-5" />}
                        title={page.title}
                        subtitle={page.updated}
                        onClick={() => openPage(page.slug)}
                      />
                    ))}
                  </div>
                </div>
              )
            })
          )}
        </>
      )}

      {/* ===== PAGE DETAIL ===== */}
      {view === 'page-detail' && (
        <>
          {pageLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : currentPage ? (
            <>
              <div className="mb-4">
                <h2 className="text-lg font-bold">{currentPage.meta.title}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-xs font-normal">
                    {typeLabel[currentPage.meta.type] || currentPage.meta.type}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {currentPage.meta.updated}
                  </span>
                </div>
              </div>
              <div className="prose prose-sm dark:prose-invert max-w-none text-[15px] leading-relaxed">
                <WikiContent content={currentPage.content} onPageClick={openPage} />
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">頁面不存在</p>
          )}
        </>
      )}

      {/* ===== INGEST ===== */}
      {view === 'ingest' && (
        <>
          <h2 className="text-lg font-bold mb-4">匯入來源</h2>

          {/* Social */}
          <div className="mb-4">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider px-1 mb-1">
              社群貼文
            </h3>
            <SourceCheckItem
              checked={selectedSources.has('social:all')}
              onChange={() => toggleSource('social:all')}
              title={`社群貼文彙整（${socialPostCount} 則）`}
              subtitle="Dcard、PTT、Threads 等平台"
            />
          </div>

          {/* Documents by type */}
          {(['transcript', 'survey', 'report'] as const).map(type => {
            const filtered = documents.filter(d => d.type === type)
            if (filtered.length === 0) return null
            const labels: Record<string, string> = { transcript: '訪談逐字稿', survey: '問卷資料', report: '研究報告' }
            return (
              <div key={type} className="mb-4">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider px-1 mb-1">
                  {labels[type]}
                </h3>
                {filtered.map(doc => (
                  <SourceCheckItem
                    key={doc.id}
                    checked={selectedSources.has(`${type}:${doc.id}`)}
                    onChange={() => toggleSource(`${type}:${doc.id}`)}
                    title={doc.title}
                    subtitle={doc.file_path?.startsWith('/uploads/') ? '已上傳' : '模擬資料'}
                  />
                ))}
              </div>
            )
          })}

          <div className="sticky bottom-0 bg-background pt-3 pb-1 border-t mt-4">
            <Button
              onClick={handleIngest}
              disabled={selectedSources.size === 0 || ingesting}
              className="w-full rounded-full font-bold"
            >
              {ingesting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  AI 分析匯入中...
                </>
              ) : (
                `匯入 ${selectedSources.size} 個來源`
              )}
            </Button>
          </div>

          {ingestResult && (
            <div className={cn(
              'mt-4 p-4 rounded-2xl',
              ingestResult.success
                ? 'bg-green-50 dark:bg-green-950/30'
                : 'bg-red-50 dark:bg-red-950/30'
            )}>
              {ingestResult.success ? (
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold">匯入成功</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      建立了 {ingestResult.pages?.length || 0} 個頁面
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {ingestResult.pages?.map(slug => (
                        <button
                          key={slug}
                          onClick={() => openPage(slug)}
                          className="text-xs px-2.5 py-1 rounded-full bg-background border hover:bg-accent transition-colors"
                        >
                          {slug}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold">匯入失敗</p>
                    <p className="text-xs text-muted-foreground mt-1">{ingestResult.error}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ===== QUERY ===== */}
      {view === 'query' && (
        <>
          <h2 className="text-lg font-bold mb-4">查詢 Wiki</h2>

          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={queryText}
              onChange={e => setQueryText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleQuery()}
              placeholder="向知識庫提問..."
              className="flex-1 px-4 py-2.5 text-[15px] border rounded-full bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <Button
              onClick={handleQuery}
              disabled={!queryText.trim() || querying}
              size="icon"
              className="h-10 w-10 rounded-full shrink-0"
            >
              {querying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>

          {wikiPages.length === 0 && !queryResult && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5 px-1">
              <Info className="h-3.5 w-3.5" />
              Wiki 目前為空，建議先匯入來源
            </p>
          )}

          {queryResult && (
            <div className="space-y-4">
              <div className="prose prose-sm dark:prose-invert max-w-none text-[15px] leading-relaxed">
                <WikiContent content={queryResult.answer} onPageClick={openPage} />
              </div>

              {queryResult.citedPages?.length > 0 && (
                <div className="pt-3 border-t">
                  <p className="text-xs font-bold text-muted-foreground mb-2">引用頁面</p>
                  <div className="flex flex-wrap gap-1.5">
                    {queryResult.citedPages.map(slug => (
                      <button
                        key={slug}
                        onClick={() => openPage(slug)}
                        className="text-xs px-2.5 py-1 rounded-full border hover:bg-accent transition-colors"
                      >
                        {slug}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {queryResult.suggestedFollowUps?.length > 0 && (
                <div className="pt-3 border-t">
                  <p className="text-xs font-bold text-muted-foreground mb-2">後續問題</p>
                  <div className="space-y-1">
                    {queryResult.suggestedFollowUps.map((q, i) => (
                      <button
                        key={i}
                        onClick={() => setQueryText(q)}
                        className="block w-full text-sm text-left px-3 py-2 rounded-xl hover:bg-accent/50 transition-colors text-primary"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ===== LINT ===== */}
      {view === 'lint' && (
        <>
          <h2 className="text-lg font-bold mb-4">健康檢查</h2>

          {linting ? (
            <div className="text-center py-16">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">檢查中...</p>
            </div>
          ) : lintResult ? (
            <div className="space-y-6">
              {/* Summary */}
              <p className="text-[15px] leading-relaxed">{lintResult.summary}</p>

              {/* Issues */}
              {lintResult.issues.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                    問題（{lintResult.issues.length}）
                  </h3>
                  <div className="divide-y">
                    {lintResult.issues.map((issue, i) => (
                      <div key={i} className="flex items-start gap-3 py-3">
                        <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm">{issue.description}</p>
                          {issue.pages.length > 0 && (
                            <div className="flex gap-1.5 mt-1">
                              {issue.pages.map(p => (
                                <button key={p} onClick={() => openPage(p)} className="text-xs text-primary hover:underline">
                                  {p}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">{issue.type}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Suggestions */}
              {lintResult.suggestions.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                    建議
                  </h3>
                  <div className="space-y-2">
                    {lintResult.suggestions.map((s, i) => (
                      <div key={i} className="flex items-start gap-3 text-sm">
                        <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                        {s}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}

// --- Sub-components ---

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-1 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-black tracking-tight">{value}</p>
    </div>
  )
}

function ListItem({
  icon,
  title,
  subtitle,
  badge,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  subtitle?: string
  badge?: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-4 px-3 py-3 hover:bg-accent/40 transition-colors text-left"
    >
      <div className="text-muted-foreground shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-medium truncate">{title}</p>
        {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
      </div>
      {badge && (
        <span className="text-xs text-muted-foreground shrink-0">{badge}</span>
      )}
      <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
    </button>
  )
}

function SourceCheckItem({
  checked,
  onChange,
  title,
  subtitle,
}: {
  checked: boolean
  onChange: () => void
  title: string
  subtitle?: string
}) {
  return (
    <label className="flex items-center gap-4 px-3 py-3 hover:bg-accent/40 transition-colors cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-[18px] w-[18px] rounded accent-foreground"
      />
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-medium truncate">{title}</p>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </label>
  )
}

function WikiContent({
  content,
  onPageClick,
}: {
  content: string
  onPageClick: (slug: string) => void
}) {
  const parts = content.split(/(\[\[[^\]]+\]\])/)
  return (
    <div className="whitespace-pre-wrap">
      {parts.map((part, i) => {
        const match = part.match(/^\[\[([^\]]+)\]\]$/)
        if (match) {
          return (
            <button
              key={i}
              onClick={() => onPageClick(match[1])}
              className="text-primary underline decoration-primary/30 hover:decoration-primary transition-colors"
            >
              {match[1]}
            </button>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </div>
  )
}
