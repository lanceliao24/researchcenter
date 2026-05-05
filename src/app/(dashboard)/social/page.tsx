'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { Search, ExternalLink, RefreshCw, Plus, X, Loader2, ChevronLeft, ChevronRight, BarChart3 } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { mockSocialPosts, mockPosNegTrend } from '@/lib/mock-data'
import type { SocialPost, Keyword } from '@/types'

const sentimentColor: Record<string, string> = {
  positive: 'bg-green-100 text-green-700',
  neutral: 'bg-muted text-foreground',
  negative: 'bg-red-100 text-red-700',
}
const sentimentLabel: Record<string, string> = {
  positive: '正面',
  neutral: '中性',
  negative: '負面',
}

const PAGE_SIZE = 20

export default function SocialPage() {
  const [search, setSearch] = useState('')
  const [platformFilter, setPlatformFilter] = useState('all')
  const [keywordFilter, setKeywordFilter] = useState('all')
  const [sentimentFilter, setSentimentFilter] = useState('all')
  const [page, setPage] = useState(1)

  const [keywords, setKeywords] = useState<Keyword[]>([])
  const [posts, setPosts] = useState<SocialPost[]>([])
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null)
  const [newKeyword, setNewKeyword] = useState('')
  const [fetching, setFetching] = useState(false)
  const [fetchMsg, setFetchMsg] = useState<string | null>(null)
  const [quota, setQuota] = useState<{ used: number; limit: number } | null>(null)

  const loadKeywords = useCallback(async () => {
    const res = await fetch('/api/social/keywords')
    const data = await res.json()
    setKeywords(data.keywords ?? [])
  }, [])

  const loadPosts = useCallback(async () => {
    const res = await fetch('/api/social/posts')
    const data = await res.json()
    setPosts(data.posts ?? [])
    setLastFetchedAt(data.lastFetchedAt ?? null)
  }, [])

  const loadQuota = useCallback(async () => {
    const res = await fetch('/api/social/fetch')
    const data = await res.json()
    setQuota(data.quota ?? null)
  }, [])

  useEffect(() => {
    loadKeywords()
    loadPosts()
    loadQuota()
  }, [loadKeywords, loadPosts, loadQuota])

  async function handleFetch() {
    setFetching(true)
    setFetchMsg(null)
    try {
      const res = await fetch('/api/social/fetch', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setFetchMsg(data.error || '抓取失敗')
      } else {
        setFetchMsg(`新增 ${data.inserted} 篇貼文`)
        await loadPosts()
      }
      if (data.quota) setQuota(data.quota)
    } catch {
      setFetchMsg('抓取失敗')
    } finally {
      setFetching(false)
    }
  }

  async function handleAddKeyword() {
    const kw = newKeyword.trim()
    if (!kw) return
    await fetch('/api/social/keywords', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword: kw }),
    })
    setNewKeyword('')
    await loadKeywords()
  }

  async function handleRemoveKeyword(id: number) {
    await fetch('/api/social/keywords', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    await loadKeywords()
  }

  async function handleToggleKeyword(id: number) {
    await fetch('/api/social/keywords', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    await loadKeywords()
  }

  const allPosts: SocialPost[] = posts.length ? posts : mockSocialPosts
  const isUsingMock = posts.length === 0

  const platforms = useMemo(() => {
    const set = new Set(allPosts.map(p => p.platform))
    return Array.from(set).sort()
  }, [allPosts])

  const filteredPosts = useMemo(() => {
    return allPosts.filter(post => {
      if (platformFilter !== 'all' && post.platform !== platformFilter) return false
      if (keywordFilter !== 'all' && post.keyword !== keywordFilter) return false
      if (sentimentFilter !== 'all' && post.sentiment !== sentimentFilter) return false
      if (search) {
        const q = search.toLowerCase()
        const matchTitle = post.title?.toLowerCase().includes(q)
        const matchDesc = post.description?.toLowerCase().includes(q)
        if (!matchTitle && !matchDesc) return false
      }
      return true
    })
  }, [allPosts, platformFilter, keywordFilter, sentimentFilter, search])

  useEffect(() => {
    setPage(1)
  }, [search, platformFilter, keywordFilter, sentimentFilter])

  const totalPages = Math.max(1, Math.ceil(filteredPosts.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pagedPosts = filteredPosts.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const sentimentStats = useMemo(() => {
    const total = filteredPosts.length
    const pos = filteredPosts.filter(p => p.sentiment === 'positive').length
    const neg = filteredPosts.filter(p => p.sentiment === 'negative').length
    const neu = filteredPosts.filter(p => p.sentiment === 'neutral').length
    return { total, pos, neg, neu }
  }, [filteredPosts])

  function clearFilters() {
    setSearch('')
    setPlatformFilter('all')
    setKeywordFilter('all')
    setSentimentFilter('all')
  }

  const hasFilters = search || platformFilter !== 'all' || keywordFilter !== 'all' || sentimentFilter !== 'all'

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">社群監測</h1>
          <p className="text-sm text-muted-foreground mt-1">
            即時追蹤社群平台上的關鍵字討論
            {lastFetchedAt && (
              <span className="ml-2">
                · 上次抓取：{new Date(lastFetchedAt).toLocaleString('zh-TW')}
              </span>
            )}
            {isUsingMock && <span className="ml-2 text-amber-600">· 目前顯示範例資料，請點「立即抓取」取得最新</span>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {quota && (
            <span className="text-xs text-muted-foreground">
              今日額度 {quota.used}/{quota.limit}
            </span>
          )}
          <Button onClick={handleFetch} disabled={fetching} size="sm">
            {fetching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            立即抓取最新
          </Button>
        </div>
      </div>

      {fetchMsg && (
        <div className="text-sm text-muted-foreground border rounded-md px-3 py-2 bg-muted/40">
          {fetchMsg}
        </div>
      )}

      {/* 正向 / 負向聲量趨勢 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            正向 / 負向聲量趨勢（近 8 週）
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={mockPosNegTrend}>
              <defs>
                <linearGradient id="socialPosGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22c55e" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="socialNegGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="date" fontSize={11} className="text-muted-foreground" />
              <YAxis fontSize={11} className="text-muted-foreground" />
              <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))' }} />
              <Area type="monotone" dataKey="正向" stroke="#22c55e" strokeWidth={2} fill="url(#socialPosGrad)" />
              <Area type="monotone" dataKey="負向" stroke="#ef4444" strokeWidth={2} fill="url(#socialNegGrad)" />
            </AreaChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-green-500" /> 正向</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500" /> 負向</span>
          </div>
        </CardContent>
      </Card>

      {/* Keywords management */}
      <div className="space-y-2">
        <div className="flex gap-2 flex-wrap items-center">
          {keywords.map((kw) => (
            <div key={kw.id} className="flex items-center gap-1">
              <Badge
                variant={keywordFilter === kw.keyword ? 'default' : kw.is_active ? 'secondary' : 'outline'}
                className="cursor-pointer"
                onClick={() => setKeywordFilter(keywordFilter === kw.keyword ? 'all' : kw.keyword)}
                onDoubleClick={() => handleToggleKeyword(kw.id)}
                title="雙擊切換啟用"
              >
                {kw.keyword}
                {!kw.is_active && <span className="ml-1 text-muted-foreground">(停用)</span>}
              </Badge>
              <button
                onClick={() => handleRemoveKeyword(kw.id)}
                className="text-muted-foreground hover:text-destructive"
                title="刪除關鍵字"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          <div className="flex gap-1 items-center">
            <Input
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddKeyword()}
              placeholder="新增關鍵字..."
              className="h-7 w-36 text-xs"
            />
            <Button onClick={handleAddKeyword} size="sm" variant="ghost" className="h-7 px-2">
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜尋標題或內容..."
            className="pl-9"
          />
        </div>
        <Select value={platformFilter} onValueChange={(v) => setPlatformFilter(v ?? 'all')}>
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue placeholder="所有平台" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">所有平台</SelectItem>
            {platforms.map(p => (
              <SelectItem key={p} value={p}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sentimentFilter} onValueChange={(v) => setSentimentFilter(v ?? 'all')}>
          <SelectTrigger className="w-full sm:w-32">
            <SelectValue placeholder="所有情緒" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">所有情緒</SelectItem>
            <SelectItem value="positive">正面</SelectItem>
            <SelectItem value="neutral">中性</SelectItem>
            <SelectItem value="negative">負面</SelectItem>
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
            清除篩選
          </Button>
        )}
      </div>

      {/* Stats bar */}
      <div className="flex gap-4 text-sm text-muted-foreground">
        <span>共 <strong className="text-foreground">{sentimentStats.total}</strong> 篇</span>
        <span className="text-green-600">{sentimentStats.pos} 正面</span>
        <span className="text-muted-foreground">{sentimentStats.neu} 中性</span>
        <span className="text-red-600">{sentimentStats.neg} 負面</span>
      </div>

      {/* Posts */}
      <Card>
        <CardHeader><CardTitle className="text-base">貼文列表</CardTitle></CardHeader>
        <CardContent>
          {filteredPosts.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground">沒有符合條件的貼文</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pagedPosts.map((post) => (
                <a
                  key={post.id}
                  href={post.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors block group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium line-clamp-1">{post.title || post.url}</p>
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-muted-foreground shrink-0 mt-0.5" />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{post.description}</p>
                    <div className="flex gap-2 mt-2 flex-wrap">
                      <Badge variant="outline" className="text-xs">{post.platform}</Badge>
                      <Badge variant="outline" className="text-xs">{post.keyword}</Badge>
                      {post.sentiment && (
                        <span className={`text-xs px-1.5 py-0.5 rounded ${sentimentColor[post.sentiment]}`}>
                          {sentimentLabel[post.sentiment]}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground ml-auto">
                        {post.published_at
                          ? `發佈 ${new Date(post.published_at).toLocaleDateString('zh-TW')}`
                          : post.fetched_at
                            ? `抓取 ${new Date(post.fetched_at).toLocaleDateString('zh-TW')}`
                            : ''}
                      </span>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}

          {filteredPosts.length > PAGE_SIZE && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-border/70">
              <span className="text-xs text-muted-foreground">
                顯示 {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredPosts.length)} 筆，共 {filteredPosts.length} 筆
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="h-8 px-2"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs px-3 tabular-nums">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="h-8 px-2"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
