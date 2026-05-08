'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2, Sparkles, Trash2, UserRound, Quote, FileText, RefreshCw, MessageCircle, Send, RotateCcw, User, Users, X, CheckSquare, Square, ImagePlus, Scale, ClipboardList } from 'lucide-react'
import type { ABTestResponse, ABTestSummary, Document, Persona, PersonaChatMessage, PersonaCategory, PersonaSurveyAnswer, PersonaSurveyFillRun, PersonaSurveyQuestionSummary, PersonaSurveyResponse, SurveyQuestion, SurveyQuestionType } from '@/types'
import { PERSONA_CATEGORIES } from '@/types'
import { useElapsed } from '@/lib/useElapsed'

interface GroupMessage {
  type: 'user' | 'persona'
  personaId?: number
  personaName?: string
  content: string
  images?: string[]
  created_at?: string
}

const GROUP_QUICK_PROMPTS = [
  '大家平常租車最在意的三件事是什麼？',
  '如果 LINE GO 新增「一鍵洗車 + 還車」功能，你們會想用嗎？',
  '你們最近一次覺得 app 用起來很煩的是什麼情境？',
  '如果只能留下一個租車功能，你們會留哪個？',
]

const QUICK_PROMPTS = [
  '介紹一下你自己',
  '你最近一次租車的體驗怎麼樣？',
  '你覺得 LINE GO 最煩的是哪裡？',
  '如果 LINE GO 新增「一鍵洗車 + 還車」功能，你會想用嗎？為什麼？',
  '你選租車平台時最在意什麼？',
  '你通常會在什麼情況下選擇計程車而不是租車？',
]

const MAX_IMAGES_PER_MESSAGE = 3
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

interface PreviewInfo {
  available: boolean
  filePath: string
  totalSpeakers?: number
  eligible?: number
  preview?: { speaker: string; turnCount: number; wordCount: number; questionRatio: number }[]
  quota?: { used: number; limit: number; remaining: number }
}

export default function PersonasPage() {
  const [personas, setPersonas] = useState<Persona[]>([])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [reindexing, setReindexing] = useState(false)
  const generateElapsed = useElapsed(generating)
  const [preview, setPreview] = useState<PreviewInfo | null>(null)
  const [filePath, setFilePath] = useState('/Users/lanceliao/Downloads/rental.yml')
  const [limit, setLimit] = useState(10)
  const [message, setMessage] = useState<string | null>(null)
  const [genCategory, setGenCategory] = useState<PersonaCategory | 'auto'>('auto')
  const [categoryFilter, setCategoryFilter] = useState<PersonaCategory | 'all'>('all')
  const [selectMode, setSelectMode] = useState<'none' | 'group' | 'ab' | 'survey'>('none')
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [groupDialogOpen, setGroupDialogOpen] = useState(false)
  const [abDialogOpen, setAbDialogOpen] = useState(false)
  const [surveyDialogOpen, setSurveyDialogOpen] = useState(false)

  const filteredPersonas =
    categoryFilter === 'all' ? personas : personas.filter(p => p.category === categoryFilter)

  const categoryCounts = personas.reduce<Record<string, number>>((acc, p) => {
    acc[p.category] = (acc[p.category] ?? 0) + 1
    return acc
  }, {})

  const selectedPersonas = personas.filter(p => selectedIds.includes(p.id))
  const inSelectMode = selectMode !== 'none'

  function toggleSelect(id: number) {
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
  }

  function enterSelectMode(mode: 'group' | 'ab' | 'survey') {
    setSelectMode(mode)
    setSelectedIds([])
  }

  function exitSelectMode() {
    setSelectMode('none')
    setSelectedIds([])
  }

  const loadPersonas = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/personas')
    const data = await res.json()
    setPersonas(data.personas ?? [])
    setLoading(false)
  }, [])

  const loadPreview = useCallback(async () => {
    const res = await fetch('/api/personas/generate')
    const data = await res.json()
    setPreview(data)
  }, [])

  useEffect(() => {
    loadPersonas()
    loadPreview()
  }, [loadPersonas, loadPreview])

  async function handleReindex() {
    if (!confirm(`重新索引所有 ${personas.length} 個 persona 的訪談原文？\n（每個 persona 會消耗 ~20-50 個 embedding 配額）`)) return
    setReindexing(true)
    setMessage(null)
    try {
      const res = await fetch('/api/personas/reindex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage(data.error ?? '索引失敗')
      } else {
        setMessage(`已索引 ${data.results?.length ?? 0} 個 persona，共 ${data.totalIndexed} 個 chunks`)
      }
    } catch (err) {
      setMessage((err as Error).message)
    } finally {
      setReindexing(false)
    }
  }

  async function handleGenerate() {
    setGenerating(true)
    setMessage(null)
    try {
      const res = await fetch('/api/personas/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath,
          limit,
          ...(genCategory !== 'auto' ? { category: genCategory } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage(data.error ?? '產生失敗')
      } else {
        setMessage(`已產生 ${data.created} 個 persona（合格受訪者 ${data.eligible} 位，總對話人數 ${data.totalSpeakers}）`)
        await loadPersonas()
        await loadPreview()
      }
    } catch (err) {
      setMessage((err as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  async function handleDelete(id: number) {
    await fetch('/api/personas', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    await loadPersonas()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">模擬用戶 Persona</h1>
          <p className="text-sm text-muted-foreground mt-1">
            根據訪談逐字稿萃取受訪者特徵，產生可用於產品線使用者測試的 persona
          </p>
        </div>
        <div className="flex items-center gap-3">
          {preview?.quota && (
            <span className="text-xs text-muted-foreground">
              AI 額度 {preview.quota.used}/{preview.quota.limit}
            </span>
          )}
          <Button onClick={loadPreview} size="sm" variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" /> 重新掃描
          </Button>
        </div>
      </div>

      {/* Generator */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4" /> 從訪談逐字稿產生 Persona
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <Input
              value={filePath}
              onChange={(e) => setFilePath(e.target.value)}
              placeholder="逐字稿檔案路徑"
              className="flex-1 min-w-[300px] text-xs font-mono"
            />
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">分類</span>
              <select
                value={genCategory}
                onChange={(e) => setGenCategory(e.target.value as PersonaCategory | 'auto')}
                className="h-9 rounded-sm border bg-background px-2 text-xs"
              >
                <option value="auto">自動偵測</option>
                {PERSONA_CATEGORIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">最多產生</span>
              <Input
                type="number"
                value={limit}
                onChange={(e) => setLimit(Math.max(1, Math.min(50, Number(e.target.value))))}
                className="w-20"
              />
              <span className="text-xs text-muted-foreground">位</span>
            </div>
            <Button onClick={handleGenerate} disabled={generating} size="sm">
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Pro 產生中{generateElapsed > 0 ? ` (${generateElapsed}s)` : ''}
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  產生 Persona
                </>
              )}
            </Button>
            {personas.length > 0 && (
              <Button
                onClick={handleReindex}
                disabled={reindexing}
                size="sm"
                variant="outline"
                title="重新把每個 persona 的訪談原文切 chunk + embedding，讓 1:1 chat 能引用更精準的原話"
              >
                {reindexing ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <RotateCcw className="h-4 w-4 mr-2" />
                )}
                重新索引訪談原文
              </Button>
            )}
          </div>

          {generating && (
            <p className="text-xs text-muted-foreground">
              Gemini 2.5 Pro 正在從訪談逐字稿萃取 persona，每位 ~15-25 秒（{limit} 位約需 {Math.ceil(limit * 20 / 60)} 分鐘）
            </p>
          )}

          {preview?.available && (
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="border rounded-md p-3">
                <div className="text-xs text-muted-foreground">總對話人數</div>
                <div className="text-xl font-semibold">{preview.totalSpeakers}</div>
              </div>
              <div className="border rounded-md p-3">
                <div className="text-xs text-muted-foreground">合格受訪者</div>
                <div className="text-xl font-semibold">{preview.eligible}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  ≥30 次發言 · ≥500 字 · 提問比 ≤50%
                </div>
              </div>
              <div className="border rounded-md p-3">
                <div className="text-xs text-muted-foreground">已產生 Persona</div>
                <div className="text-xl font-semibold">{personas.length}</div>
              </div>
            </div>
          )}

          {preview?.available === false && (
            <p className="text-xs text-amber-600">
              找不到檔案：{preview.filePath}，請確認路徑。
            </p>
          )}

          {message && (
            <div className="text-sm border rounded-md px-3 py-2 bg-muted/40">
              {message}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Persona cards */}
      <div>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
          <h2 className="text-sm font-semibold tracking-wider uppercase text-muted-foreground">
            Persona 列表 ({filteredPersonas.length}/{personas.length})
          </h2>
          <div className="flex items-center gap-2">
            {selectMode === 'group' && (
              <>
                <span className="text-xs text-muted-foreground">
                  已選 {selectedIds.length} 位
                </span>
                <Button
                  size="sm"
                  onClick={() => setGroupDialogOpen(true)}
                  disabled={selectedIds.length < 2}
                >
                  <Users className="h-3.5 w-3.5 mr-2" />
                  開始群組訪談 ({selectedIds.length})
                </Button>
                <Button size="sm" variant="ghost" onClick={exitSelectMode}>
                  <X className="h-3.5 w-3.5 mr-1" /> 取消
                </Button>
              </>
            )}
            {selectMode === 'ab' && (
              <>
                <span className="text-xs text-muted-foreground">
                  已選 {selectedIds.length} 位
                </span>
                <Button
                  size="sm"
                  onClick={() => setAbDialogOpen(true)}
                  disabled={selectedIds.length < 1}
                >
                  <Scale className="h-3.5 w-3.5 mr-2" />
                  開始 A/B test ({selectedIds.length})
                </Button>
                <Button size="sm" variant="ghost" onClick={exitSelectMode}>
                  <X className="h-3.5 w-3.5 mr-1" /> 取消
                </Button>
              </>
            )}
            {selectMode === 'survey' && (
              <>
                <span className="text-xs text-muted-foreground">
                  已選 {selectedIds.length} 位
                </span>
                <Button
                  size="sm"
                  onClick={() => setSurveyDialogOpen(true)}
                  disabled={selectedIds.length < 1}
                >
                  <ClipboardList className="h-3.5 w-3.5 mr-2" />
                  開始問卷模擬 ({selectedIds.length})
                </Button>
                <Button size="sm" variant="ghost" onClick={exitSelectMode}>
                  <X className="h-3.5 w-3.5 mr-1" /> 取消
                </Button>
              </>
            )}
            {selectMode === 'none' && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => enterSelectMode('group')}
                  disabled={personas.length < 2}
                >
                  <Users className="h-3.5 w-3.5 mr-2" />
                  群組訪談
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => enterSelectMode('ab')}
                  disabled={personas.length < 1}
                >
                  <Scale className="h-3.5 w-3.5 mr-2" />
                  A/B test
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => enterSelectMode('survey')}
                  disabled={personas.length < 1}
                >
                  <ClipboardList className="h-3.5 w-3.5 mr-2" />
                  問卷模擬
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Category tabs */}
        <div className="flex gap-1 mb-4 border-b">
          <CategoryTab
            label="全部"
            count={personas.length}
            active={categoryFilter === 'all'}
            onClick={() => setCategoryFilter('all')}
          />
          {PERSONA_CATEGORIES.map(c => (
            <CategoryTab
              key={c}
              label={c}
              count={categoryCounts[c] ?? 0}
              active={categoryFilter === c}
              onClick={() => setCategoryFilter(c)}
            />
          ))}
        </div>

        {loading ? (
          <div className="text-sm text-muted-foreground py-8 text-center">載入中...</div>
        ) : personas.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center space-y-2">
              <UserRound className="h-10 w-10 text-muted-foreground/40 mx-auto" />
              <p className="text-sm text-muted-foreground">
                還沒有 persona，請先點擊上方「產生 Persona」
              </p>
            </CardContent>
          </Card>
        ) : filteredPersonas.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-sm text-muted-foreground">
                「{categoryFilter}」分類底下還沒有 persona
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPersonas.map((p) => (
              <PersonaCard
                key={p.id}
                persona={p}
                onDelete={() => handleDelete(p.id)}
                groupMode={inSelectMode}
                selected={selectedIds.includes(p.id)}
                onToggleSelect={() => toggleSelect(p.id)}
              />
            ))}
          </div>
        )}
      </div>

      <GroupChatDialog
        personas={selectedPersonas}
        open={groupDialogOpen}
        onOpenChange={setGroupDialogOpen}
      />

      <ABTestDialog
        personas={selectedPersonas}
        open={abDialogOpen}
        onOpenChange={setAbDialogOpen}
      />

      <SurveyFillDialog
        personas={selectedPersonas}
        open={surveyDialogOpen}
        onOpenChange={setSurveyDialogOpen}
      />
    </div>
  )
}

function CategoryTab({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
        active
          ? 'border-foreground text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
      <span className="ml-1.5 text-[10px] text-muted-foreground">{count}</span>
    </button>
  )
}

function PersonaCard({
  persona,
  onDelete,
  groupMode = false,
  selected = false,
  onToggleSelect,
}: {
  persona: Persona
  onDelete: () => void
  groupMode?: boolean
  selected?: boolean
  onToggleSelect?: () => void
}) {
  const [chatOpen, setChatOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  return (
    <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
      <Card
        className={`transition-colors ${
          groupMode
            ? selected
              ? 'border-foreground ring-1 ring-foreground cursor-pointer'
              : 'hover:border-foreground/60 cursor-pointer'
            : 'hover:border-primary/50'
        }`}
        onClick={groupMode ? onToggleSelect : undefined}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0 flex items-start gap-2">
              {groupMode && (
                <div className="pt-0.5 shrink-0">
                  {selected ? (
                    <CheckSquare className="h-4 w-4 text-foreground" />
                  ) : (
                    <Square className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              )}
              <div className="flex-1 min-w-0">
                {groupMode ? (
                  <div>
                    <CardTitle className="text-base truncate">{persona.name}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {persona.age_range} · {persona.gender} · {persona.occupation}
                    </p>
                  </div>
                ) : (
                  <button
                    className="text-left w-full"
                    onClick={() => setDetailsOpen(true)}
                  >
                    <CardTitle className="text-base truncate">{persona.name}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {persona.age_range} · {persona.gender} · {persona.occupation}
                    </p>
                  </button>
                )}
              </div>
            </div>
            {!groupMode && (
              <button
                onClick={onDelete}
                className="text-muted-foreground/50 hover:text-destructive transition-colors"
                title="刪除"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">
              {persona.category}
            </Badge>
            <span className="text-[10px] text-muted-foreground">{persona.location}</span>
          </div>
          <p className="text-sm line-clamp-2">{persona.summary}</p>
          <div className="flex gap-1 flex-wrap">
            {persona.tags.slice(0, 5).map((t, i) => (
              <Badge key={i} variant="secondary" className="text-[10px]">
                {t}
              </Badge>
            ))}
          </div>
          {persona.quotes[0] && (
            <div className="border-l-2 border-border pl-3 text-xs italic text-muted-foreground line-clamp-2">
              「{persona.quotes[0]}」
            </div>
          )}
          {!groupMode && (
            <Button
              onClick={() => setChatOpen(true)}
              variant="outline"
              size="sm"
              className="w-full"
            >
              <MessageCircle className="h-3.5 w-3.5 mr-2" /> 與此用戶對話
            </Button>
          )}
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground/70 pt-1 border-t">
            <FileText className="h-3 w-3" />
            <span className="truncate">
              {persona.source.file} · {persona.source.speaker} · {persona.source.utterance_count} 則發言
            </span>
          </div>
        </CardContent>
      </Card>

      <PersonaChatDialog persona={persona} open={chatOpen} onOpenChange={setChatOpen} />

      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">{persona.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <InfoRow label="年齡" value={persona.age_range} />
            <InfoRow label="性別" value={persona.gender} />
            <InfoRow label="職業" value={persona.occupation} />
            <InfoRow label="地區" value={persona.location} />
          </div>

          <Section title="Persona 摘要">
            <p className="text-sm">{persona.summary}</p>
          </Section>

          <Section title="背景">
            <p className="text-sm text-muted-foreground">{persona.background}</p>
          </Section>

          <Section title="目標">
            <BulletList items={persona.goals} />
          </Section>

          <Section title="痛點">
            <BulletList items={persona.pain_points} />
          </Section>

          <Section title="行為">
            <BulletList items={persona.behaviors} />
          </Section>

          <Section title="服務偏好">
            <BulletList items={persona.service_preferences} />
          </Section>

          {persona.quotes.length > 0 && (
            <Section title="金句">
              <div className="space-y-2">
                {persona.quotes.map((q, i) => (
                  <div key={i} className="flex gap-2 text-sm italic text-muted-foreground border-l-2 border-primary/30 pl-3 py-1">
                    <Quote className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary/50" />
                    <span>「{q}」</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          <Section title="標籤">
            <div className="flex gap-1.5 flex-wrap">
              {persona.tags.map((t, i) => (
                <Badge key={i} variant="secondary">{t}</Badge>
              ))}
            </div>
          </Section>

          <div className="text-xs text-muted-foreground pt-3 border-t">
            來源：{persona.source.file} · {persona.source.speaker} · {persona.source.utterance_count} 則發言
            <br />
            建立時間：{new Date(persona.created_at).toLocaleString('zh-TW')}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold tracking-[0.15em] uppercase text-muted-foreground mb-2">
        {title}
      </div>
      {children}
    </div>
  )
}

function BulletList({ items }: { items: string[] }) {
  if (!items.length) return <p className="text-sm text-muted-foreground/60">—</p>
  return (
    <ul className="space-y-1.5">
      {items.map((it, i) => (
        <li key={i} className="text-sm flex gap-2">
          <span className="text-primary/50 shrink-0">·</span>
          <span>{it}</span>
        </li>
      ))}
    </ul>
  )
}

function PersonaChatDialog({
  persona,
  open,
  onOpenChange,
}: {
  persona: Persona
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [messages, setMessages] = useState<PersonaChatMessage[]>([])
  const [input, setInput] = useState('')
  const [pendingImages, setPendingImages] = useState<File[]>([])
  const [previewUrls, setPreviewUrls] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadHistory = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/personas/${persona.id}/chat`)
      const data = await res.json()
      setMessages(data.messages ?? [])
    } finally {
      setLoading(false)
    }
  }, [persona.id])

  useEffect(() => {
    if (open) loadHistory()
  }, [open, loadHistory])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    return () => {
      previewUrls.forEach(url => URL.revokeObjectURL(url))
    }
  }, [previewUrls])

  function handlePickImages(files: FileList | null) {
    if (!files) return
    setError(null)
    const incoming = Array.from(files)
    const available = MAX_IMAGES_PER_MESSAGE - pendingImages.length
    if (available <= 0) {
      setError(`一則訊息最多 ${MAX_IMAGES_PER_MESSAGE} 張圖`)
      return
    }
    const accepted: File[] = []
    for (const f of incoming.slice(0, available)) {
      if (!ALLOWED_IMAGE_MIMES.includes(f.type)) {
        setError(`不支援的格式：${f.name}（只支援 jpg/png/webp/gif）`)
        continue
      }
      if (f.size > MAX_IMAGE_BYTES) {
        setError(`圖片過大：${f.name}（上限 5 MB）`)
        continue
      }
      accepted.push(f)
    }
    if (accepted.length === 0) return
    setPendingImages(prev => [...prev, ...accepted])
    setPreviewUrls(prev => [...prev, ...accepted.map(f => URL.createObjectURL(f))])
  }

  function removePendingImage(index: number) {
    setPendingImages(prev => prev.filter((_, i) => i !== index))
    setPreviewUrls(prev => {
      const url = prev[index]
      if (url) URL.revokeObjectURL(url)
      return prev.filter((_, i) => i !== index)
    })
  }

  async function handleSend(text?: string) {
    const message = (text ?? input).trim()
    if ((!message && pendingImages.length === 0) || sending) return
    setSending(true)
    setError(null)
    setInput('')
    const sentImages = pendingImages
    const sentPreviews = previewUrls
    setPendingImages([])
    setPreviewUrls([])
    const optimisticId = Date.now()
    setMessages(prev => [
      ...prev,
      {
        id: optimisticId,
        role: 'user',
        content: message,
        images: sentPreviews.length > 0 ? sentPreviews : undefined,
        created_at: new Date().toISOString(),
      },
    ])
    try {
      const form = new FormData()
      form.append('message', message)
      for (const file of sentImages) form.append('images', file)
      const res = await fetch(`/api/personas/${persona.id}/chat`, {
        method: 'POST',
        body: form,
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? '送出失敗')
        await loadHistory()
      } else {
        await loadHistory()
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      sentPreviews.forEach(url => URL.revokeObjectURL(url))
      setSending(false)
    }
  }

  async function handleClear() {
    if (!confirm('清空與此 persona 的對話紀錄？')) return
    await fetch(`/api/personas/${persona.id}/chat`, { method: 'DELETE' })
    setMessages([])
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 py-4 border-b">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-10 w-10 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-sm font-bold text-primary">{persona.name.slice(0, 1)}</span>
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-base truncate">{persona.name}</DialogTitle>
                <p className="text-xs text-muted-foreground truncate">
                  {persona.age_range} · {persona.occupation} · {persona.location}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="h-8 text-muted-foreground"
              title="清空對話"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </DialogHeader>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loading ? (
            <div className="text-center text-sm text-muted-foreground py-8">
              <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
              載入對話紀錄...
            </div>
          ) : messages.length === 0 ? (
            <div className="space-y-4">
              <div className="text-center py-6">
                <div className="h-14 w-14 mx-auto rounded-full bg-muted flex items-center justify-center mb-3">
                  <MessageCircle className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">開始與 {persona.name} 對話</p>
                <p className="text-xs text-muted-foreground mt-1">
                  他/她會以訪談中的語氣與觀點回答你
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                  快速提問
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {QUICK_PROMPTS.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => handleSend(q)}
                      disabled={sending}
                      className="text-left text-xs px-3 py-2 rounded-sm border hover:bg-accent/40 transition-colors disabled:opacity-50"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            messages.map((m) => <MessageBubble key={m.id} message={m} personaName={persona.name} />)
          )}
          {sending && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground pl-11">
              <Loader2 className="h-3 w-3 animate-spin" />
              {persona.name} 正在回覆...
            </div>
          )}
        </div>

        {error && (
          <div className="px-5 py-2 text-xs text-destructive border-t bg-destructive/5">
            {error}
          </div>
        )}

        <div className="px-5 py-3 border-t space-y-2">
          {previewUrls.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {previewUrls.map((url, i) => (
                <div key={url} className="relative group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`待送出 ${i + 1}`}
                    className="h-16 w-16 object-cover rounded-sm border"
                  />
                  <button
                    type="button"
                    onClick={() => removePendingImage(i)}
                    className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-background border shadow-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    title="移除"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2 items-center">
            <input
              ref={fileInputRef}
              type="file"
              accept={ALLOWED_IMAGE_MIMES.join(',')}
              multiple
              hidden
              onChange={(e) => {
                handlePickImages(e.target.files)
                e.target.value = ''
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={sending || pendingImages.length >= MAX_IMAGES_PER_MESSAGE}
              className="h-9 w-9 p-0 shrink-0"
              title={`附加圖片（最多 ${MAX_IMAGES_PER_MESSAGE} 張）`}
            >
              <ImagePlus className="h-4 w-4" />
            </Button>
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder={
                pendingImages.length > 0
                  ? `要讓 ${persona.name} 看這張圖...（可留空）`
                  : `問 ${persona.name} 一個問題，或貼張 UI 畫面...`
              }
              disabled={sending}
              className="text-sm"
            />
            <Button
              onClick={() => handleSend()}
              disabled={sending || (!input.trim() && pendingImages.length === 0)}
              size="sm"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function MessageBubble({ message, personaName }: { message: PersonaChatMessage; personaName: string }) {
  const isUser = message.role === 'user'
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className="h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-xs font-bold">
        {isUser ? (
          <div className="h-full w-full rounded-full bg-muted flex items-center justify-center">
            <User className="h-4 w-4 text-muted-foreground" />
          </div>
        ) : (
          <div className="h-full w-full rounded-full bg-primary/10 text-primary flex items-center justify-center">
            {personaName.slice(0, 1)}
          </div>
        )}
      </div>
      <div className={`max-w-[75%] ${isUser ? 'text-right' : ''}`}>
        {message.images && message.images.length > 0 && (
          <div className={`flex gap-1.5 flex-wrap mb-1.5 ${isUser ? 'justify-end' : ''}`}>
            {message.images.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="inline-block"
              >
                <img
                  src={url}
                  alt={`訊息附圖 ${i + 1}`}
                  className="max-h-40 max-w-[200px] rounded-sm border object-cover"
                />
              </a>
            ))}
          </div>
        )}
        {message.content && (
          <div
            className={`inline-block px-3 py-2 rounded-sm text-sm whitespace-pre-wrap ${
              isUser
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-foreground'
            }`}
          >
            {message.content}
          </div>
        )}
      </div>
    </div>
  )
}

function GroupChatDialog({
  personas,
  open,
  onOpenChange,
}: {
  personas: Persona[]
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [history, setHistory] = useState<GroupMessage[]>([])
  const [input, setInput] = useState('')
  const [pendingImages, setPendingImages] = useState<File[]>([])
  const [previewUrls, setPreviewUrls] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [answering, setAnswering] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const idsKey = personas.map(p => p.id).sort((a, b) => a - b).join(',')

  useEffect(() => {
    return () => {
      previewUrls.forEach(url => URL.revokeObjectURL(url))
    }
  }, [previewUrls])

  function handlePickImages(files: FileList | null) {
    if (!files) return
    setError(null)
    const incoming = Array.from(files)
    const available = MAX_IMAGES_PER_MESSAGE - pendingImages.length
    if (available <= 0) {
      setError(`一則訊息最多 ${MAX_IMAGES_PER_MESSAGE} 張圖`)
      return
    }
    const accepted: File[] = []
    for (const f of incoming.slice(0, available)) {
      if (!ALLOWED_IMAGE_MIMES.includes(f.type)) {
        setError(`不支援的格式：${f.name}（只支援 jpg/png/webp/gif）`)
        continue
      }
      if (f.size > MAX_IMAGE_BYTES) {
        setError(`圖片過大：${f.name}（上限 5 MB）`)
        continue
      }
      accepted.push(f)
    }
    if (accepted.length === 0) return
    setPendingImages(prev => [...prev, ...accepted])
    setPreviewUrls(prev => [...prev, ...accepted.map(f => URL.createObjectURL(f))])
  }

  function removePendingImage(index: number) {
    setPendingImages(prev => prev.filter((_, i) => i !== index))
    setPreviewUrls(prev => {
      const url = prev[index]
      if (url) URL.revokeObjectURL(url)
      return prev.filter((_, i) => i !== index)
    })
  }

  const loadHistory = useCallback(async () => {
    if (!idsKey) return
    setLoading(true)
    try {
      const res = await fetch(`/api/personas/group-chat?ids=${idsKey}`)
      const data = await res.json()
      setHistory(data.messages ?? [])
    } finally {
      setLoading(false)
    }
  }, [idsKey])

  useEffect(() => {
    if (open) {
      setError(null)
      loadHistory()
    }
  }, [open, loadHistory])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [history, answering])

  async function handleSend(text?: string) {
    const message = (text ?? input).trim()
    if ((!message && pendingImages.length === 0) || sending || personas.length < 2) return
    setSending(true)
    setError(null)
    setInput('')
    const sentImages = pendingImages
    const sentPreviews = previewUrls
    setPendingImages([])
    setPreviewUrls([])
    const userMsg: GroupMessage = {
      type: 'user',
      content: message,
      images: sentPreviews.length > 0 ? sentPreviews : undefined,
      created_at: new Date().toISOString(),
    }
    setHistory(prev => [...prev, userMsg])
    setAnswering(personas[0]?.name ?? null)

    try {
      const form = new FormData()
      form.append('personaIds', personas.map(p => p.id).join(','))
      form.append('message', message)
      for (const file of sentImages) form.append('images', file)
      const res = await fetch('/api/personas/group-chat', {
        method: 'POST',
        body: form,
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? '送出失敗')
        await loadHistory()
      } else {
        await loadHistory()
        if (data.errors?.length > 0) {
          setError(`部分 persona 回覆失敗：${data.errors.map((e: { personaName: string }) => e.personaName).join('、')}`)
        }
      }
    } catch (err) {
      setError((err as Error).message)
      await loadHistory()
    } finally {
      sentPreviews.forEach(url => URL.revokeObjectURL(url))
      setSending(false)
      setAnswering(null)
    }
  }

  async function handleClear() {
    if (!confirm('清空這組受訪者的訪談紀錄？')) return
    await fetch(`/api/personas/group-chat?ids=${idsKey}`, { method: 'DELETE' })
    setHistory([])
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 py-4 border-b">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" />
                焦點團體訪談（{personas.length} 位）
              </DialogTitle>
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                {personas.map(p => (
                  <div
                    key={p.id}
                    className="flex items-center gap-1.5 text-xs bg-muted/60 rounded-sm px-2 py-0.5"
                  >
                    <span className="h-4 w-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[9px] font-bold">
                      {p.name.slice(0, 1)}
                    </span>
                    <span>{p.name}</span>
                    <span className="text-muted-foreground">· {p.category}</span>
                  </div>
                ))}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="h-8 text-muted-foreground shrink-0"
              title="清空本組訪談紀錄"
              disabled={history.length === 0}
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </DialogHeader>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loading ? (
            <div className="text-center text-sm text-muted-foreground py-8">
              <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
              載入訪談紀錄...
            </div>
          ) : history.length === 0 && !sending ? (
            <div className="space-y-4">
              <div className="text-center py-6">
                <div className="h-14 w-14 mx-auto rounded-full bg-muted flex items-center justify-center mb-3">
                  <Users className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">開始焦點團體訪談</p>
                <p className="text-xs text-muted-foreground mt-1">
                  每次發問會依序得到 {personas.length} 位受訪者的回答，後面的人看得到前面的發言
                </p>
                <p className="text-[10px] text-muted-foreground/70 mt-1">
                  單題耗 {personas.length} 份 AI 額度
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                  建議開場問題
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {GROUP_QUICK_PROMPTS.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => handleSend(q)}
                      disabled={sending}
                      className="text-left text-xs px-3 py-2 rounded-sm border hover:bg-accent/40 transition-colors disabled:opacity-50"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            history.map((m, i) => <GroupBubble key={i} message={m} />)
          )}
          {sending && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground pl-11">
              <Loader2 className="h-3 w-3 animate-spin" />
              {answering ? `${answering} 正在回覆中（依序輪流）...` : '產生中...'}
            </div>
          )}
        </div>

        {error && (
          <div className="px-5 py-2 text-xs text-destructive border-t bg-destructive/5">
            {error}
          </div>
        )}

        <div className="px-5 py-3 border-t space-y-2">
          {previewUrls.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {previewUrls.map((url, i) => (
                <div key={url} className="relative group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`待送出 ${i + 1}`}
                    className="h-16 w-16 object-cover rounded-sm border"
                  />
                  <button
                    type="button"
                    onClick={() => removePendingImage(i)}
                    className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-background border shadow-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    title="移除"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2 items-center">
            <input
              ref={fileInputRef}
              type="file"
              accept={ALLOWED_IMAGE_MIMES.join(',')}
              multiple
              hidden
              onChange={(e) => {
                handlePickImages(e.target.files)
                e.target.value = ''
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={sending || pendingImages.length >= MAX_IMAGES_PER_MESSAGE}
              className="h-9 w-9 p-0 shrink-0"
              title={`附加圖片（最多 ${MAX_IMAGES_PER_MESSAGE} 張，每位 persona 都會看到）`}
            >
              <ImagePlus className="h-4 w-4" />
            </Button>
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder={
                pendingImages.length > 0
                  ? '要讓所有受訪者看這張圖...（可留空）'
                  : '向這組受訪者提問，或貼張 UI 畫面...'
              }
              disabled={sending}
              className="text-sm"
            />
            <Button
              onClick={() => handleSend()}
              disabled={sending || (!input.trim() && pendingImages.length === 0)}
              size="sm"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            同組受訪者的訪談紀錄會保留，再次選同一組即可接續
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface ABOptionState {
  title: string
  description: string
  images: File[]
  previews: string[]
}

interface ABTestRunResult {
  responses: ABTestResponse[]
  summary: ABTestSummary
  options: {
    A: { title: string; description: string; imageUrls: string[] }
    B: { title: string; description: string; imageUrls: string[] }
  }
}

const EMPTY_OPTION: ABOptionState = { title: '', description: '', images: [], previews: [] }

function ABTestDialog({
  personas,
  open,
  onOpenChange,
}: {
  personas: Persona[]
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [optionA, setOptionA] = useState<ABOptionState>(EMPTY_OPTION)
  const [optionB, setOptionB] = useState<ABOptionState>(EMPTY_OPTION)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<ABTestRunResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      optionA.previews.forEach(URL.revokeObjectURL)
      optionB.previews.forEach(URL.revokeObjectURL)
    }
  }, [optionA.previews, optionB.previews])

  function reset() {
    optionA.previews.forEach(URL.revokeObjectURL)
    optionB.previews.forEach(URL.revokeObjectURL)
    setOptionA(EMPTY_OPTION)
    setOptionB(EMPTY_OPTION)
    setResult(null)
    setError(null)
  }

  function handleClose(v: boolean) {
    if (!v) reset()
    onOpenChange(v)
  }

  function updateOption(
    which: 'A' | 'B',
    patch: Partial<ABOptionState>
  ) {
    const setter = which === 'A' ? setOptionA : setOptionB
    setter(prev => ({ ...prev, ...patch }))
  }

  function addImages(which: 'A' | 'B', files: FileList | null) {
    if (!files) return
    setError(null)
    const current = which === 'A' ? optionA : optionB
    const available = MAX_IMAGES_PER_MESSAGE - current.images.length
    if (available <= 0) {
      setError(`方案 ${which} 最多 ${MAX_IMAGES_PER_MESSAGE} 張圖`)
      return
    }
    const accepted: File[] = []
    for (const f of Array.from(files).slice(0, available)) {
      if (!ALLOWED_IMAGE_MIMES.includes(f.type)) {
        setError(`不支援的格式：${f.name}`)
        continue
      }
      if (f.size > MAX_IMAGE_BYTES) {
        setError(`圖片過大：${f.name}（上限 5 MB）`)
        continue
      }
      accepted.push(f)
    }
    if (accepted.length === 0) return
    const newPreviews = accepted.map(f => URL.createObjectURL(f))
    updateOption(which, {
      images: [...current.images, ...accepted],
      previews: [...current.previews, ...newPreviews],
    })
  }

  function removeImage(which: 'A' | 'B', index: number) {
    const current = which === 'A' ? optionA : optionB
    const url = current.previews[index]
    if (url) URL.revokeObjectURL(url)
    updateOption(which, {
      images: current.images.filter((_, i) => i !== index),
      previews: current.previews.filter((_, i) => i !== index),
    })
  }

  async function handleRun() {
    setError(null)
    const aHas = optionA.description.trim() || optionA.images.length > 0
    const bHas = optionB.description.trim() || optionB.images.length > 0
    if (!aHas || !bHas) {
      setError('方案 A 和 B 都至少需要描述或一張圖')
      return
    }
    setRunning(true)
    try {
      const form = new FormData()
      form.append('personaIds', personas.map(p => p.id).join(','))
      form.append('titleA', optionA.title)
      form.append('descriptionA', optionA.description)
      for (const f of optionA.images) form.append('imagesA', f)
      form.append('titleB', optionB.title)
      form.append('descriptionB', optionB.description)
      for (const f of optionB.images) form.append('imagesB', f)

      const res = await fetch('/api/personas/ab-test', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? '執行失敗')
      } else {
        setResult(data)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setRunning(false)
    }
  }

  const estimatedCost = personas.length * 2
  const canRun = !running && personas.length > 0

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 py-4 border-b">
          <DialogTitle className="text-base flex items-center gap-2">
            <Scale className="h-4 w-4" />
            A/B test（{personas.length} 位）
          </DialogTitle>
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            {personas.map(p => (
              <div
                key={p.id}
                className="flex items-center gap-1.5 text-xs bg-muted/60 rounded-sm px-2 py-0.5"
              >
                <span className="h-4 w-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[9px] font-bold">
                  {p.name.slice(0, 1)}
                </span>
                <span>{p.name}</span>
                <span className="text-muted-foreground">· {p.category}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            以 semantic Likert 評估每位受訪者對 A / B 的「會不會用」意圖（1–5 分），避免強迫二選一偏誤。每人耗 2 份 AI 額度。
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {!result && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <OptionEditor
                  label="A"
                  option={optionA}
                  onTitleChange={t => updateOption('A', { title: t })}
                  onDescriptionChange={d => updateOption('A', { description: d })}
                  onAddImages={files => addImages('A', files)}
                  onRemoveImage={i => removeImage('A', i)}
                  disabled={running}
                />
                <OptionEditor
                  label="B"
                  option={optionB}
                  onTitleChange={t => updateOption('B', { title: t })}
                  onDescriptionChange={d => updateOption('B', { description: d })}
                  onAddImages={files => addImages('B', files)}
                  onRemoveImage={i => removeImage('B', i)}
                  disabled={running}
                />
              </div>
            </>
          )}

          {result && <ABTestResults result={result} onReset={reset} />}
        </div>

        {error && (
          <div className="px-5 py-2 text-xs text-destructive border-t bg-destructive/5">
            {error}
          </div>
        )}

        {!result && (
          <div className="px-5 py-3 border-t flex items-center justify-between">
            <p className="text-[11px] text-muted-foreground">
              預估耗 {estimatedCost} 份 AI 額度
            </p>
            <Button onClick={handleRun} disabled={!canRun} size="sm">
              {running ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  執行中（逐位評估）
                </>
              ) : (
                <>
                  <Scale className="h-4 w-4 mr-2" />
                  執行 A/B test
                </>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function OptionEditor({
  label,
  option,
  onTitleChange,
  onDescriptionChange,
  onAddImages,
  onRemoveImage,
  disabled,
}: {
  label: 'A' | 'B'
  option: ABOptionState
  onTitleChange: (v: string) => void
  onDescriptionChange: (v: string) => void
  onAddImages: (files: FileList | null) => void
  onRemoveImage: (i: number) => void
  disabled: boolean
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  return (
    <div className="border rounded-md p-3 space-y-3">
      <div className="flex items-center gap-2">
        <div className="h-6 w-6 rounded-sm bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
          {label}
        </div>
        <span className="text-xs uppercase tracking-wider text-muted-foreground">
          方案 {label}
        </span>
      </div>
      <Input
        value={option.title}
        onChange={e => onTitleChange(e.target.value)}
        placeholder={`方案 ${label} 名稱（選填）`}
        disabled={disabled}
        className="text-sm"
      />
      <Textarea
        value={option.description}
        onChange={e => onDescriptionChange(e.target.value)}
        placeholder={`描述方案 ${label}：功能、用法、情境...（可留空，只附圖）`}
        disabled={disabled}
        rows={5}
        className="text-sm"
      />
      <div className="space-y-2">
        {option.previews.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {option.previews.map((url, i) => (
              <div key={url} className="relative group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`方案 ${label} 圖 ${i + 1}`}
                  className="h-16 w-16 object-cover rounded-sm border"
                />
                <button
                  type="button"
                  onClick={() => onRemoveImage(i)}
                  disabled={disabled}
                  className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-background border shadow-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          hidden
          multiple
          accept={ALLOWED_IMAGE_MIMES.join(',')}
          onChange={e => {
            onAddImages(e.target.files)
            e.target.value = ''
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileRef.current?.click()}
          disabled={disabled || option.images.length >= MAX_IMAGES_PER_MESSAGE}
          className="h-8"
        >
          <ImagePlus className="h-3.5 w-3.5 mr-2" />
          附加畫面（{option.images.length}/{MAX_IMAGES_PER_MESSAGE}）
        </Button>
      </div>
    </div>
  )
}

function ABTestResults({
  result,
  onReset,
}: {
  result: ABTestRunResult
  onReset: () => void
}) {
  const { summary, responses, options } = result
  const diff = summary.meanDiff
  const winnerLabel =
    Math.abs(diff) < 0.3 ? '平手' : diff > 0 ? 'A 勝出' : 'B 勝出'
  const winnerColor = Math.abs(diff) < 0.3 ? 'text-muted-foreground' : 'text-primary'

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <OptionSummaryCard label="A" title={options.A.title} mean={summary.meanA} />
        <OptionSummaryCard label="B" title={options.B.title} mean={summary.meanB} />
        <div className="border rounded-md p-3 flex flex-col justify-center">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            總結
          </div>
          <div className={`text-lg font-bold mt-1 ${winnerColor}`}>{winnerLabel}</div>
          <div className="text-xs text-muted-foreground mt-1">
            差距 {diff > 0 ? '+' : ''}
            {diff.toFixed(2)} 分
          </div>
          <div className="text-[10px] text-muted-foreground mt-1.5">
            A: {summary.winnerCount.A} · B: {summary.winnerCount.B} · 平手: {summary.winnerCount.tie}
            · 有效 N={summary.total}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          每位受訪者評估
        </div>
        {responses.map(r => (
          <PerPersonaRow key={r.personaId} response={r} />
        ))}
      </div>

      <div className="flex justify-end pt-2">
        <Button variant="outline" size="sm" onClick={onReset}>
          <RotateCcw className="h-3.5 w-3.5 mr-2" />
          重新測試
        </Button>
      </div>
    </div>
  )
}

function OptionSummaryCard({
  label,
  title,
  mean,
}: {
  label: 'A' | 'B'
  title: string
  mean: number
}) {
  return (
    <div className="border rounded-md p-3">
      <div className="flex items-center gap-2">
        <div className="h-5 w-5 rounded-sm bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">
          {label}
        </div>
        <span className="text-xs text-muted-foreground truncate">
          {title || `方案 ${label}`}
        </span>
      </div>
      <div className="mt-2 text-2xl font-semibold">{mean.toFixed(2)}</div>
      <div className="text-[10px] text-muted-foreground">平均使用意圖 (1–5)</div>
      <ScoreBar score={mean} />
    </div>
  )
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, ((score - 1) / 4) * 100))
  return (
    <div className="h-1.5 bg-muted rounded-full mt-2 overflow-hidden">
      <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
    </div>
  )
}

function PerPersonaRow({ response }: { response: ABTestResponse }) {
  const [expanded, setExpanded] = useState(false)
  if (response.error) {
    return (
      <div className="border rounded-md p-3 text-xs text-destructive">
        {response.personaName}：{response.error}
      </div>
    )
  }
  const a = response.A
  const b = response.B
  if (!a || !b) return null
  const winner = response.winner
  const winnerBadge =
    winner === 'A'
      ? { text: 'A', color: 'bg-primary text-primary-foreground' }
      : winner === 'B'
      ? { text: 'B', color: 'bg-primary text-primary-foreground' }
      : { text: '平手', color: 'bg-muted text-muted-foreground' }

  return (
    <div className="border rounded-md">
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full px-3 py-2.5 flex items-center gap-3 text-left hover:bg-accent/30 transition-colors"
      >
        <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
          {response.personaName.slice(0, 1)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{response.personaName}</div>
          <div className="flex items-center gap-3 mt-1">
            <MiniScore label="A" score={a.score} likert={a.likert} />
            <MiniScore label="B" score={b.score} likert={b.likert} />
          </div>
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-sm ${winnerBadge.color}`}>
          {winnerBadge.text}
        </span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 pt-1 space-y-3 border-t">
          <PersonaReaction label="A" reaction={a.reaction} />
          <PersonaReaction label="B" reaction={b.reaction} />
        </div>
      )}
    </div>
  )
}

function MiniScore({ label, score, likert }: { label: 'A' | 'B'; score: number; likert: number }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{score.toFixed(2)}</span>
      <span className="text-[10px] text-muted-foreground">(Likert {likert})</span>
    </div>
  )
}

function PersonaReaction({ label, reaction }: { label: 'A' | 'B'; reaction: string }) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        對方案 {label} 的反應
      </div>
      <p className="text-sm italic text-muted-foreground border-l-2 border-primary/30 pl-3 py-0.5">
        「{reaction}」
      </p>
    </div>
  )
}

function GroupBubble({ message }: { message: GroupMessage }) {
  if (message.type === 'user') {
    return (
      <div className="flex gap-3 flex-row-reverse">
        <div className="h-8 w-8 shrink-0 rounded-full bg-muted flex items-center justify-center">
          <User className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="max-w-[75%] text-right">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">主持人</div>
          {message.images && message.images.length > 0 && (
            <div className="flex gap-1.5 flex-wrap mb-1.5 justify-end">
              {message.images.map((url, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <a key={i} href={url} target="_blank" rel="noreferrer" className="inline-block">
                  <img
                    src={url}
                    alt={`主持人附圖 ${i + 1}`}
                    className="max-h-40 max-w-[200px] rounded-sm border object-cover"
                  />
                </a>
              ))}
            </div>
          )}
          {message.content && (
            <div className="inline-block px-3 py-2 rounded-sm text-sm whitespace-pre-wrap bg-primary text-primary-foreground">
              {message.content}
            </div>
          )}
        </div>
      </div>
    )
  }
  return (
    <div className="flex gap-3">
      <div className="h-8 w-8 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
        {message.personaName?.slice(0, 1) ?? '?'}
      </div>
      <div className="max-w-[75%]">
        <div className="text-[10px] font-medium text-muted-foreground mb-1">
          {message.personaName}
        </div>
        <div className="inline-block px-3 py-2 rounded-sm text-sm whitespace-pre-wrap bg-muted text-foreground">
          {message.content}
        </div>
      </div>
    </div>
  )
}

interface SurveyColumn {
  header: string
  avgLen: number
  fillRate: number
  samples: string[]
  isOpenEnded: boolean
}

interface SurveyMeta {
  survey: { id: number; title: string }
  totalRows: number
  columns: SurveyColumn[]
}

const MAX_SURVEY_QUESTIONS = 15
const MAX_PASTE_LENGTH = 12000

const TYPE_LABEL: Record<SurveyQuestionType, string> = {
  single: '單選',
  multi: '複選',
  likert: '量表',
  open: '開放',
}

function SurveyFillDialog({
  personas,
  open,
  onOpenChange,
}: {
  personas: Persona[]
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [mode, setMode] = useState<'csv' | 'pasted'>('csv')

  const [surveys, setSurveys] = useState<Document[]>([])
  const [loadingSurveys, setLoadingSurveys] = useState(false)
  const [surveyId, setSurveyId] = useState<number | null>(null)
  const [meta, setMeta] = useState<SurveyMeta | null>(null)
  const [loadingMeta, setLoadingMeta] = useState(false)
  const [selectedHeaders, setSelectedHeaders] = useState<string[]>([])

  const [pasteText, setPasteText] = useState('')
  const [pasteTitle, setPasteTitle] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parsedQuestions, setParsedQuestions] = useState<SurveyQuestion[] | null>(null)

  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<PersonaSurveyFillRun | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadSurveys = useCallback(async () => {
    setLoadingSurveys(true)
    try {
      const res = await fetch('/api/documents?type=survey')
      const data = await res.json()
      setSurveys(data.documents ?? [])
    } finally {
      setLoadingSurveys(false)
    }
  }, [])

  const loadMeta = useCallback(async (id: number) => {
    setLoadingMeta(true)
    setMeta(null)
    setSelectedHeaders([])
    setError(null)
    try {
      const res = await fetch(`/api/personas/survey-fill?surveyId=${id}`)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? '無法載入 survey')
      } else {
        setMeta({
          survey: data.survey,
          totalRows: data.totalRows,
          columns: data.columns,
        })
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoadingMeta(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      loadSurveys()
      setResult(null)
      setError(null)
    }
  }, [open, loadSurveys])

  function reset() {
    setSurveyId(null)
    setMeta(null)
    setSelectedHeaders([])
    setPasteText('')
    setPasteTitle('')
    setParsedQuestions(null)
    setResult(null)
    setError(null)
  }

  function handleClose(v: boolean) {
    if (!v) reset()
    onOpenChange(v)
  }

  function pickSurvey(id: number) {
    setSurveyId(id)
    loadMeta(id)
  }

  function toggleHeader(header: string) {
    setSelectedHeaders(prev => {
      if (prev.includes(header)) return prev.filter(h => h !== header)
      if (prev.length >= MAX_SURVEY_QUESTIONS) return prev
      return [...prev, header]
    })
  }

  async function handleParse() {
    const text = pasteText.trim()
    if (!text) return
    setParsing(true)
    setError(null)
    try {
      const res = await fetch('/api/personas/parse-survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: text }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? '解析失敗')
      } else {
        setParsedQuestions(data.questions)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setParsing(false)
    }
  }

  function updateParsedType(idx: number, type: SurveyQuestionType) {
    setParsedQuestions(prev => {
      if (!prev) return prev
      const next = [...prev]
      const q: SurveyQuestion = { ...next[idx], type }
      if (type === 'open') {
        delete q.options
        delete q.scale
      } else if (type === 'likert') {
        delete q.options
        if (!q.scale) q.scale = { min: 1, max: 5 }
      } else {
        delete q.scale
        if (!q.options) q.options = ['選項 1', '選項 2']
      }
      next[idx] = q
      return next
    })
  }

  function deleteParsed(idx: number) {
    setParsedQuestions(prev => prev ? prev.filter((_, i) => i !== idx) : prev)
  }

  async function handleRun() {
    if (personas.length === 0) return
    setRunning(true)
    setError(null)
    try {
      const body = mode === 'csv'
        ? {
            source: 'csv',
            surveyId,
            personaIds: personas.map(p => p.id),
            questions: selectedHeaders,
          }
        : {
            source: 'pasted',
            personaIds: personas.map(p => p.id),
            surveyTitle: pasteTitle.trim() || undefined,
            questions: parsedQuestions,
          }
      const res = await fetch('/api/personas/survey-fill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? '執行失敗')
      } else {
        setResult(data.run)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setRunning(false)
    }
  }

  const questionsCount = mode === 'csv' ? selectedHeaders.length : (parsedQuestions?.length ?? 0)
  const estimatedCost = personas.length * questionsCount
  const canRun =
    !running &&
    personas.length > 0 &&
    questionsCount > 0 &&
    (mode === 'csv' ? !!surveyId : true)

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 py-4 border-b">
          <DialogTitle className="text-base flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            問卷模擬填答（{personas.length} 位）
          </DialogTitle>
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            {personas.map(p => (
              <div
                key={p.id}
                className="flex items-center gap-1.5 text-xs bg-muted/60 rounded-sm px-2 py-0.5"
              >
                <span className="h-4 w-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[9px] font-bold">
                  {p.name.slice(0, 1)}
                </span>
                <span>{p.name}</span>
                <span className="text-muted-foreground">· {p.category}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            支援 4 種題型：單選 / 複選 / 量表（重用 USAGE_INTENT_ANCHORS，1=不會用 → 5=一定會用）/ 開放式
          </p>
        </DialogHeader>

        {!result && (
          <div className="px-5 pt-4 border-b">
            <div className="flex gap-1">
              <SurveyTabBtn label="從 CSV" active={mode === 'csv'} onClick={() => setMode('csv')} />
              <SurveyTabBtn label="貼上問卷" active={mode === 'pasted'} onClick={() => setMode('pasted')} />
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {!result && mode === 'csv' && (
            <CsvSurveySelect
              surveys={surveys}
              loadingSurveys={loadingSurveys}
              surveyId={surveyId}
              onPick={pickSurvey}
              meta={meta}
              loadingMeta={loadingMeta}
              selected={selectedHeaders}
              onToggle={toggleHeader}
            />
          )}

          {!result && mode === 'pasted' && (
            <PastedSurveyEditor
              text={pasteText}
              onTextChange={setPasteText}
              title={pasteTitle}
              onTitleChange={setPasteTitle}
              parsing={parsing}
              parsed={parsedQuestions}
              onParse={handleParse}
              onUpdateType={updateParsedType}
              onDelete={deleteParsed}
            />
          )}

          {result && <SurveyFillResults run={result} onReset={reset} />}
        </div>

        {error && (
          <div className="px-5 py-2 text-xs text-destructive border-t bg-destructive/5">
            {error}
          </div>
        )}

        {!result && (
          <div className="px-5 py-3 border-t flex items-center justify-between">
            <p className="text-[11px] text-muted-foreground">
              預估耗 {estimatedCost} 份 AI 額度（{personas.length} 位 × {questionsCount} 題）
            </p>
            <Button onClick={handleRun} disabled={!canRun} size="sm">
              {running ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  執行中（逐題評估）
                </>
              ) : (
                <>
                  <ClipboardList className="h-4 w-4 mr-2" />
                  執行問卷模擬
                </>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function SurveyTabBtn({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
        active
          ? 'border-foreground text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
    </button>
  )
}

function CsvSurveySelect({
  surveys,
  loadingSurveys,
  surveyId,
  onPick,
  meta,
  loadingMeta,
  selected,
  onToggle,
}: {
  surveys: Document[]
  loadingSurveys: boolean
  surveyId: number | null
  onPick: (id: number) => void
  meta: SurveyMeta | null
  loadingMeta: boolean
  selected: string[]
  onToggle: (header: string) => void
}) {
  return (
    <>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
          選擇問卷
        </div>
        {loadingSurveys ? (
          <div className="text-xs text-muted-foreground py-3">
            <Loader2 className="h-3.5 w-3.5 animate-spin inline mr-2" />
            載入問卷清單...
          </div>
        ) : surveys.length === 0 ? (
          <div className="text-xs text-muted-foreground border rounded-md px-3 py-3">
            還沒有上傳的問卷。請到「問卷分析」頁上傳 CSV，或切到「貼上問卷」。
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {surveys.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => onPick(s.id)}
                className={`text-left border rounded-md px-3 py-2 transition-colors ${
                  surveyId === s.id
                    ? 'border-foreground ring-1 ring-foreground bg-accent/30'
                    : 'hover:bg-accent/40'
                }`}
              >
                <div className="text-sm font-medium truncate">{s.title}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {typeof (s.metadata as Record<string, unknown>)?.rows === 'number'
                    ? `${((s.metadata as Record<string, unknown>).rows as number).toLocaleString()} 筆`
                    : ''}
                  <span className="ml-2">{new Date(s.created_at).toLocaleDateString('zh-TW')}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {surveyId && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              選擇要模擬的題目（{selected.length}/{MAX_SURVEY_QUESTIONS}）
            </div>
            {meta && (
              <div className="text-[10px] text-muted-foreground">
                共 {meta.totalRows.toLocaleString()} 筆 · {meta.columns.length} 個欄位
              </div>
            )}
          </div>
          {loadingMeta ? (
            <div className="text-xs text-muted-foreground py-3">
              <Loader2 className="h-3.5 w-3.5 animate-spin inline mr-2" />
              解析欄位...
            </div>
          ) : meta ? (
            <div className="border rounded-md divide-y max-h-[400px] overflow-y-auto">
              {meta.columns.map(col => {
                const checked = selected.includes(col.header)
                const disabled = !checked && selected.length >= MAX_SURVEY_QUESTIONS
                return (
                  <button
                    key={col.header}
                    type="button"
                    onClick={() => onToggle(col.header)}
                    disabled={disabled}
                    className={`w-full text-left px-3 py-2.5 flex items-start gap-3 transition-colors ${
                      checked ? 'bg-accent/40' : 'hover:bg-accent/20'
                    } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    <div className="pt-0.5 shrink-0">
                      {checked ? (
                        <CheckSquare className="h-4 w-4 text-foreground" />
                      ) : (
                        <Square className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium break-all">{col.header}</span>
                        {col.isOpenEnded && (
                          <Badge variant="outline" className="text-[9px]">開放式</Badge>
                        )}
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          填答率 {Math.round(col.fillRate * 100)}% · 平均 {col.avgLen} 字
                        </span>
                      </div>
                      {col.samples.length > 0 && (
                        <div className="text-[11px] text-muted-foreground mt-1 line-clamp-2">
                          例：{col.samples.join(' / ')}
                        </div>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          ) : null}
          <p className="text-[10px] text-muted-foreground mt-2">
            CSV 模式所有題目都當「量表」題（重用 USAGE_INTENT_ANCHORS）。要其他題型請改用「貼上問卷」。
          </p>
        </div>
      )}
    </>
  )
}

function PastedSurveyEditor({
  text,
  onTextChange,
  title,
  onTitleChange,
  parsing,
  parsed,
  onParse,
  onUpdateType,
  onDelete,
}: {
  text: string
  onTextChange: (v: string) => void
  title: string
  onTitleChange: (v: string) => void
  parsing: boolean
  parsed: SurveyQuestion[] | null
  onParse: () => void
  onUpdateType: (idx: number, type: SurveyQuestionType) => void
  onDelete: (idx: number) => void
}) {
  return (
    <>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
          問卷標題（選填）
        </div>
        <Input
          value={title}
          onChange={e => onTitleChange(e.target.value)}
          placeholder="例：LINE GO 共享車使用經驗調查"
          className="text-sm"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            貼上問卷文字
          </div>
          <div className="text-[10px] text-muted-foreground">
            {text.length}/{MAX_PASTE_LENGTH}
          </div>
        </div>
        <Textarea
          value={text}
          onChange={e => onTextChange(e.target.value.slice(0, MAX_PASTE_LENGTH))}
          rows={10}
          className="text-sm font-mono"
          placeholder={`貼上問卷原始文字，例：

1. 你通常使用什麼方式進入服務？
   - APP
   - LINE
   - 網頁

2. 操作流程容易度（1=非常困難，5=非常容易）
   - 地圖搜車
   - 預約車輛
   - 取車流程

3. 有沒有想分享的使用心得？（開放式）`}
        />
        <div className="flex justify-end mt-2">
          <Button onClick={onParse} disabled={parsing || !text.trim()} size="sm">
            {parsing ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
                AI 解析中...
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5 mr-2" />
                AI 解析（耗 1 份額度）
              </>
            )}
          </Button>
        </div>
      </div>

      {parsed && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            解析結果（{parsed.length} 題）
          </div>
          {parsed.length === 0 ? (
            <div className="text-xs text-muted-foreground border rounded-md px-3 py-3">
              題目都被刪光了，請重新解析或貼新內容。
            </div>
          ) : (
            <div className="border rounded-md divide-y max-h-[400px] overflow-y-auto">
              {parsed.map((q, idx) => (
                <div key={idx} className="px-3 py-2.5 flex items-start gap-3">
                  <div className="text-[10px] tabular-nums text-muted-foreground pt-0.5 w-5 shrink-0">
                    #{idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm break-words">{q.text}</div>
                    {(q.type === 'single' || q.type === 'multi') && q.options && (
                      <div className="text-[11px] text-muted-foreground mt-1">
                        {q.options.map((o, i) => (
                          <span key={i} className="inline-block mr-3">
                            · {o}
                          </span>
                        ))}
                      </div>
                    )}
                    {q.type === 'likert' && q.scale && (
                      <div className="text-[11px] text-muted-foreground mt-1">
                        {q.scale.min}–{q.scale.max}
                        {q.scale.minLabel ? `（${q.scale.min}=${q.scale.minLabel}）` : ''}
                        {q.scale.maxLabel ? `（${q.scale.max}=${q.scale.maxLabel}）` : ''}
                      </div>
                    )}
                  </div>
                  <select
                    value={q.type}
                    onChange={e => onUpdateType(idx, e.target.value as SurveyQuestionType)}
                    className="h-7 rounded-sm border bg-background px-2 text-xs shrink-0"
                  >
                    <option value="single">單選</option>
                    <option value="multi">複選</option>
                    <option value="likert">量表</option>
                    <option value="open">開放</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => onDelete(idx)}
                    className="text-muted-foreground/50 hover:text-destructive transition-colors shrink-0 pt-0.5"
                    title="刪除這題"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className="text-[10px] text-muted-foreground mt-2">
            可手動修正題型或刪題。最多 {MAX_SURVEY_QUESTIONS} 題會送出模擬。
          </p>
        </div>
      )}
    </>
  )
}

function SurveyFillResults({
  run,
  onReset,
}: {
  run: PersonaSurveyFillRun
  onReset: () => void
}) {
  return (
    <div className="space-y-5">
      <div className="border rounded-md p-3">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {run.surveyTitle} · {run.source === 'pasted' ? '貼上' : 'CSV'}
        </div>
        <div className="text-sm font-medium mt-1">
          {run.responses.length} 位 × {run.questions.length} 題
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5">
          {new Date(run.createdAt).toLocaleString('zh-TW')}
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
          每題彙整
        </div>
        <div className="space-y-2">
          {run.summary.map((s, i) => (
            <QuestionSummaryCard key={i} summary={s} />
          ))}
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
          每位受訪者作答
        </div>
        <div className="space-y-3">
          {run.responses.map(r => (
            <PersonaSurveyRow key={r.personaId} response={r} />
          ))}
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button variant="outline" size="sm" onClick={onReset}>
          <RotateCcw className="h-3.5 w-3.5 mr-2" />
          重新模擬
        </Button>
      </div>
    </div>
  )
}

function QuestionSummaryCard({ summary }: { summary: PersonaSurveyQuestionSummary }) {
  return (
    <div className="border rounded-md px-3 py-2.5">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="text-sm flex-1 min-w-0 break-words">{summary.question}</div>
        <Badge variant="outline" className="text-[9px] shrink-0">
          {TYPE_LABEL[summary.type]}
        </Badge>
      </div>

      {summary.type === 'likert' && typeof summary.meanScore === 'number' && (
        <>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-1">
            <span>平均使用意圖（1–5）</span>
            <span>
              <span className="text-base font-semibold tabular-nums text-foreground mr-1">
                {summary.meanScore.toFixed(2)}
              </span>
              N={summary.responseCount}
            </span>
          </div>
          <ScoreBarSimple score={summary.meanScore} />
        </>
      )}

      {(summary.type === 'single' || summary.type === 'multi') && summary.choiceDistribution && (
        <div className="mt-1 space-y-1.5">
          {summary.choiceDistribution.length === 0 ? (
            <div className="text-[11px] text-muted-foreground">沒有有效作答</div>
          ) : (
            summary.choiceDistribution.map((c, i) => {
              const pct = summary.responseCount === 0
                ? 0
                : (c.count / summary.responseCount) * 100
              return (
                <div key={i}>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="break-all">{c.choice}</span>
                    <span className="tabular-nums text-muted-foreground shrink-0 ml-2">
                      {c.count} ({pct.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="h-1 bg-muted rounded-full mt-0.5 overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })
          )}
          <div className="text-[10px] text-muted-foreground mt-1">N={summary.responseCount}</div>
        </div>
      )}

      {summary.type === 'open' && (
        <div className="text-[11px] text-muted-foreground mt-1">
          {summary.responseCount} 位回答了，請展開下方各受訪者看完整內容
        </div>
      )}
    </div>
  )
}

function ScoreBarSimple({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, ((score - 1) / 4) * 100))
  return (
    <div className="h-1.5 bg-muted rounded-full mt-2 overflow-hidden">
      <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
    </div>
  )
}

function PersonaSurveyRow({ response }: { response: PersonaSurveyResponse }) {
  const [expanded, setExpanded] = useState(false)
  const valid = response.answers
  const likertScores = valid
    .map(a => a.score)
    .filter((n): n is number => typeof n === 'number')
  const meanScore = likertScores.length === 0
    ? null
    : likertScores.reduce((s, v) => s + v, 0) / likertScores.length

  return (
    <div className="border rounded-md">
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full px-3 py-2.5 flex items-center gap-3 text-left hover:bg-accent/30 transition-colors"
      >
        <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
          {response.personaName.slice(0, 1)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{response.personaName}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {valid.length} 題
            {meanScore != null && <span className="ml-2">量表平均 {meanScore.toFixed(2)}</span>}
            {response.error && <span className="text-destructive ml-2">部分失敗</span>}
          </div>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {expanded ? '收合' : '展開'}
        </span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 pt-1 space-y-3 border-t">
          {response.answers.map((a, i) => (
            <PersonaAnswerRow key={i} answer={a} />
          ))}
          {response.error && (
            <div className="text-[10px] text-destructive border-t pt-2">
              {response.error}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function PersonaAnswerRow({ answer }: { answer: PersonaSurveyAnswer }) {
  return (
    <div className="space-y-1">
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-medium text-muted-foreground break-all flex-1 min-w-0">
          {answer.question}
        </div>
        <div className="text-[10px] tabular-nums shrink-0 flex items-center gap-1.5">
          <Badge variant="outline" className="text-[9px]">
            {TYPE_LABEL[answer.type]}
          </Badge>
          {answer.type === 'likert' && typeof answer.score === 'number' && (
            <span>
              {answer.score.toFixed(2)}
              <span className="text-muted-foreground ml-1">(L{answer.likert})</span>
            </span>
          )}
        </div>
      </div>
      {answer.type === 'single' && answer.choice && (
        <div className="text-sm text-foreground">→ <span className="font-medium">{answer.choice}</span></div>
      )}
      {answer.type === 'multi' && answer.choices && answer.choices.length > 0 && (
        <div className="text-sm text-foreground">
          → <span className="font-medium">{answer.choices.join('、')}</span>
        </div>
      )}
      {answer.reaction && (
        <p className="text-sm italic text-muted-foreground border-l-2 border-primary/30 pl-3 py-0.5">
          「{answer.reaction}」
        </p>
      )}
    </div>
  )
}

