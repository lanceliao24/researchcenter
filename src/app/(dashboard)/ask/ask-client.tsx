'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Send,
  Loader2,
  Bot,
  User,
  Sparkles,
  Plus,
  MessageSquare,
  Trash2,
  ArrowRight,
} from 'lucide-react'
import type { ChatMessage } from '@/types'
import { QUICK_ASK_PROMPTS } from '@/lib/quick-asks'

interface HistoryItem {
  id: string
  title: string
  scope: string
  messageCount: number
  updated_at: string
}

export function AskClient() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [scope, setScope] = useState<string>('all')
  const [elapsed, setElapsed] = useState(0)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const autoSubmittedRef = useRef(false)

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (!loading) {
      setElapsed(0)
      return
    }
    const start = Date.now()
    setElapsed(0)
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000))
    }, 500)
    return () => clearInterval(id)
  }, [loading])

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/ask/history')
      const data = await res.json()
      setHistory(data.conversations ?? [])
    } catch {
      // silent
    }
  }, [])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  async function persist(id: string | null, nextMessages: ChatMessage[], nextScope: string) {
    try {
      const res = await fetch('/api/ask/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, scope: nextScope, messages: nextMessages }),
      })
      const data = await res.json()
      if (data.conversation?.id) {
        setConversationId(data.conversation.id)
        loadHistory()
      }
    } catch {
      // silent
    }
  }

  const sendQuestion = useCallback(
    async (question: string) => {
      if (!question.trim() || loading) return
      const userMessage: ChatMessage = { role: 'user', content: question }
      const nextWithUser = [...messages, userMessage]
      setMessages(nextWithUser)
      setInput('')
      setLoading(true)
      try {
        const res = await fetch('/api/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: nextWithUser, scope }),
        })
        const data = await res.json()
        const assistant: ChatMessage = {
          role: 'assistant',
          content: data.answer || data.error || '抱歉，無法回答這個問題',
          sources: data.sources,
        }
        const nextAll = [...nextWithUser, assistant]
        setMessages(nextAll)
        persist(conversationId, nextAll, scope)
      } catch {
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: '發生錯誤，請稍後再試' },
        ])
      } finally {
        setLoading(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loading, messages, scope, conversationId],
  )

  useEffect(() => {
    if (autoSubmittedRef.current) return
    const q = searchParams.get('q')
    if (!q || !q.trim()) return
    autoSubmittedRef.current = true
    sendQuestion(q)
    router.replace('/ask')
  }, [searchParams, router, sendQuestion])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await sendQuestion(input)
  }

  function startNewChat() {
    setMessages([])
    setConversationId(null)
    setInput('')
  }

  async function loadConversation(id: string) {
    try {
      const res = await fetch(`/api/ask/history/${id}`)
      if (!res.ok) return
      const data = await res.json()
      const conv = data.conversation
      if (conv) {
        setMessages(conv.messages ?? [])
        setScope(conv.scope ?? 'all')
        setConversationId(conv.id)
      }
    } catch {
      // silent
    }
  }

  async function deleteConv(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('刪除此對話？')) return
    try {
      const res = await fetch(`/api/ask/history/${id}`, { method: 'DELETE' })
      if (res.ok) {
        if (conversationId === id) startNewChat()
        loadHistory()
      }
    } catch {
      // silent
    }
  }

  const scopes = [
    { value: 'all', label: '全部資料' },
    { value: 'social', label: '僅社群' },
    { value: 'transcript', label: '僅訪談' },
    { value: 'survey', label: '僅問卷' },
    { value: 'report', label: '僅報告' },
  ]

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">AI 研究問答</h1>
        <p className="text-sm text-muted-foreground mt-1">
          針對所有研究資料提問，AI 會引用來源回答
        </p>
        <div className="flex gap-2 mt-3">
          {scopes.map(s => (
            <Badge
              key={s.value}
              variant={scope === s.value ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => setScope(s.value)}
            >
              {s.label}
            </Badge>
          ))}
        </div>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        <aside className="w-60 shrink-0 flex flex-col gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={startNewChat}
            className="w-full justify-start"
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            新對話
          </Button>
          <Card className="flex-1 min-h-0 flex flex-col">
            <div className="px-3 py-2 border-b text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" />
              對話紀錄（{history.length}）
            </div>
            <ScrollArea className="flex-1">
              {history.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6 px-3">
                  尚無對話紀錄
                </p>
              ) : (
                <div className="p-1.5 space-y-0.5">
                  {history.map(h => (
                    <button
                      key={h.id}
                      onClick={() => loadConversation(h.id)}
                      className={`w-full text-left text-xs rounded-md px-2 py-2 group flex items-start gap-1.5 transition-colors ${
                        conversationId === h.id
                          ? 'bg-accent text-foreground'
                          : 'hover:bg-accent/50 text-muted-foreground'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-foreground">{h.title}</div>
                        <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-muted-foreground">
                          <span>{h.messageCount} 則訊息</span>
                          <span>·</span>
                          <span>
                            {new Date(h.updated_at).toLocaleDateString('zh-TW', {
                              month: 'numeric',
                              day: 'numeric',
                            })}
                          </span>
                        </div>
                      </div>
                      <span
                        role="button"
                        onClick={e => deleteConv(h.id, e)}
                        className="opacity-0 group-hover:opacity-100 shrink-0 text-muted-foreground hover:text-destructive p-0.5"
                        title="刪除"
                      >
                        <Trash2 className="h-3 w-3" />
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </Card>
        </aside>

        <Card className="flex-1 flex flex-col overflow-hidden">
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {messages.length === 0 && !loading && (
                <EmptyStateSuggestions onPick={sendQuestion} />
              )}
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center shrink-0 mt-0.5">
                      <Bot className="h-4 w-4 text-primary-foreground" />
                    </div>
                  )}
                  <div
                    className={`rounded-lg px-4 py-2.5 max-w-[80%] ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-border space-y-1">
                        <p className="text-xs text-muted-foreground font-medium">來源：</p>
                        {msg.sources.map((src, j) => (
                          <div key={j} className="text-xs text-muted-foreground">
                            <span className="font-medium">[{src.type}]</span>{' '}
                            {src.url ? (
                              <a
                                href={src.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline"
                              >
                                {src.title}
                              </a>
                            ) : (
                              src.title
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {msg.role === 'user' && (
                    <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                      <User className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div className="flex gap-3">
                  <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center shrink-0">
                    <Bot className="h-4 w-4 text-primary-foreground" />
                  </div>
                  <div className="bg-muted rounded-lg px-4 py-2.5 flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    <span className="text-xs text-muted-foreground tabular-nums">
                      思考中 {elapsed}s
                      <span className="text-muted-foreground/60 ml-1.5">
                        {elapsed < 5
                          ? '· 檢索資料中...'
                          : elapsed < 15
                            ? '· AI 生成中，通常 5–15 秒'
                            : elapsed < 30
                              ? '· 較長的問題可能需要 20–30 秒'
                              : '· 仍在處理，可能是資料量較大或 AI 較忙'}
                      </span>
                    </span>
                  </div>
                </div>
              )}
              <div ref={scrollRef} />
            </div>
          </ScrollArea>

          <div className="border-t p-4">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <Textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="輸入你的研究問題..."
                className="resize-none min-h-[44px] max-h-32"
                rows={1}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSubmit(e)
                  }
                }}
              />
              <Button type="submit" size="icon" disabled={loading || !input.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </Card>
      </div>
    </div>
  )
}

function EmptyStateSuggestions({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="py-8">
      <div className="text-center mb-6">
        <Bot className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
        <p className="text-sm text-muted-foreground">
          開始新對話，或從下方常見問題挑一個
        </p>
      </div>
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-2 mb-3 text-xs font-medium text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          推薦問題
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {QUICK_ASK_PROMPTS.map((q, i) => (
            <button
              key={i}
              onClick={() => onPick(q)}
              className="flex items-center justify-between gap-2 text-sm px-3 py-2.5 rounded-lg border hover:bg-accent/50 hover:border-primary/40 transition-colors group text-left"
            >
              <span className="text-muted-foreground group-hover:text-foreground transition-colors line-clamp-2">
                {q}
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-foreground shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
