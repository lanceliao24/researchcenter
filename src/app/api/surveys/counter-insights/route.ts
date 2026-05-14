import { NextRequest, NextResponse } from 'next/server'
import { isLocalMode } from '@/lib/local-mode'
import { chatPro, wrapUntrusted } from '@/lib/gemini'
import {
  checkQuota,
  incrementQuota,
  getQuotaStatus,
  quotaDeniedMessage,
} from '@/lib/quota'
import { listMonths, listMetricsByMonth, loadMonthRawRows } from '@/lib/monthly-survey-store'
import {
  readCounterInsights,
  writeCounterInsights,
  type Contradiction,
  type CounterInsightsSnapshot,
  type ServiceCounterInsights,
} from '@/lib/counter-insights-store'
import { getServiceLabel } from '@/lib/issue-trends-store'
import type { SurveyMonthlyRawRow } from '@/types'

// NPS conventions:
//   Promoter:  9-10
//   Passive:   7-8
//   Detractor: 0-6

const MIN_TIER_SIZE = 5 // skip services with fewer than 5 rows in either tier
const MAX_QUOTES_PER_TIER = 30

interface ServiceCohort {
  service: string
  month: string
  promoters: SurveyMonthlyRawRow[]
  detractors: SurveyMonthlyRawRow[]
}

function buildCohorts(month: string): ServiceCohort[] {
  const rows = loadMonthRawRows(month)
  const byService = new Map<string, SurveyMonthlyRawRow[]>()
  for (const r of rows) {
    const arr = byService.get(r.service) ?? []
    arr.push(r)
    byService.set(r.service, arr)
  }
  const out: ServiceCohort[] = []
  for (const [service, list] of byService) {
    const promoters = list.filter(r => r.nps >= 9)
    const detractors = list.filter(r => r.nps <= 6)
    if (promoters.length < MIN_TIER_SIZE || detractors.length < MIN_TIER_SIZE) continue
    out.push({ service, month, promoters, detractors })
  }
  return out
}

function gatherQuotes(rows: SurveyMonthlyRawRow[]): string[] {
  const out: string[] = []
  for (const r of rows) {
    for (const v of [...r.suggestion, ...r.other_suggestion, ...r.complaints, ...r.other_complaints]) {
      const t = v.trim()
      if (t.length >= 4) out.push(t)
      if (out.length >= MAX_QUOTES_PER_TIER) return out
    }
  }
  return out
}

const SYSTEM_PROMPT = `你是研究分析助手，擅長從問卷自由回應中找出「同主題、相反看法」的矛盾。

任務：給定同一服務的兩群使用者 — Promoter（NPS 9-10，整體滿意）與 Detractor（NPS 0-6，整體不滿） — 從他們的開放題回應中找出 **3-8 個**「promoter 與 detractor 對同一主題有矛盾看法」的議題。

這些矛盾通常代表：
- **場景化問題**（在某些情境下出問題，其他情境 OK）
- **個人差異**（不同使用習慣 / 不同需求群體）
- **品牌信任的分歧**（已建立信任 vs 已失去信任的差別）

**嚴格輸出合法 JSON，不可包含 markdown code fence 或其他文字。**

格式：
{
  "contradictions": [
    {
      "topic": "主題標籤（5-10 字）",
      "promoter_view": "promoter 對此主題的觀感（一句話，使用 promoter 的用詞）",
      "detractor_view": "detractor 對此主題的觀感（一句話，使用 detractor 的用詞）",
      "scenario_hypothesis": "為什麼會分歧（30-60 字，提出可驗證的假設）",
      "promoter_indexes": [3, 7],     // promoter_quotes 中 0-based index
      "detractor_indexes": [1, 5]     // detractor_quotes 中 0-based index
    }
  ],
  "summary": "整體 narrative：列出最值得追的 2-3 個分歧 + 為什麼（80-150 字）"
}

判斷規則：
- **必須是真正的矛盾**：兩群對同一件事有相反評價。不要拿「promoter 沒提到 / detractor 抱怨」當矛盾。
- **同義 paraphrase 算同主題**：例 promoter 說「司機都很親切」/ detractor 說「司機態度差」→ 同一個「司機態度」主題、可成立。
- 一個主題沒同時有 promoter 與 detractor 的訊號就**跳過**，不要編造。
- promoter_indexes / detractor_indexes 必須真實存在於對應的 quotes 陣列。
- 若資料中找不到任何明確矛盾，回傳 contradictions: [] 並在 summary 說明。
- 繁體中文。`

interface AIContradiction {
  topic?: unknown
  promoter_view?: unknown
  detractor_view?: unknown
  scenario_hypothesis?: unknown
  promoter_indexes?: unknown
  detractor_indexes?: unknown
}

function parseAIResponse(raw: string): { contradictions: AIContradiction[]; summary: string } {
  const cleaned = raw.replace(/^```json\s*|\s*```$/g, '').replace(/^```\s*|\s*```$/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end < 0) throw new Error('AI 回傳非 JSON')
  const obj = JSON.parse(cleaned.slice(start, end + 1))
  if (!Array.isArray(obj.contradictions)) throw new Error('AI 回傳缺少 contradictions 陣列')
  return {
    contradictions: obj.contradictions as AIContradiction[],
    summary: typeof obj.summary === 'string' ? obj.summary : '',
  }
}

function sanitizeContradiction(
  raw: AIContradiction,
  promoterQuotes: string[],
  detractorQuotes: string[],
): Contradiction | null {
  const topic = typeof raw.topic === 'string' ? raw.topic.trim() : ''
  const promoterView = typeof raw.promoter_view === 'string' ? raw.promoter_view.trim() : ''
  const detractorView = typeof raw.detractor_view === 'string' ? raw.detractor_view.trim() : ''
  if (!topic || !promoterView || !detractorView) return null
  const pIdx = Array.isArray(raw.promoter_indexes)
    ? raw.promoter_indexes.map(n => Number(n)).filter(n => Number.isInteger(n) && n >= 0 && n < promoterQuotes.length)
    : []
  const dIdx = Array.isArray(raw.detractor_indexes)
    ? raw.detractor_indexes.map(n => Number(n)).filter(n => Number.isInteger(n) && n >= 0 && n < detractorQuotes.length)
    : []
  return {
    topic,
    promoter_view: promoterView,
    detractor_view: detractorView,
    scenario_hypothesis: typeof raw.scenario_hypothesis === 'string' ? raw.scenario_hypothesis : '',
    promoter_evidence: pIdx.map(i => promoterQuotes[i]),
    detractor_evidence: dIdx.map(i => detractorQuotes[i]),
  }
}

async function analyzeCohort(cohort: ServiceCohort): Promise<ServiceCounterInsights> {
  const promoterQuotes = gatherQuotes(cohort.promoters)
  const detractorQuotes = gatherQuotes(cohort.detractors)

  const userMsg = `服務別：${getServiceLabel(cohort.service)} (${cohort.service})
月份：${cohort.month}
Promoter 樣本數：${cohort.promoters.length}（NPS 9-10）
Detractor 樣本數：${cohort.detractors.length}（NPS 0-6）

PROMOTER 開放題回應（共 ${promoterQuotes.length} 句）：
${wrapUntrusted(promoterQuotes.map((q, i) => `[${i}] ${q}`).join('\n'), 'PROMOTER_QUOTES')}

DETRACTOR 開放題回應（共 ${detractorQuotes.length} 句）：
${wrapUntrusted(detractorQuotes.map((q, i) => `[${i}] ${q}`).join('\n'), 'DETRACTOR_QUOTES')}

請找出 promoter 與 detractor 對同一主題有矛盾看法的 3-8 個議題，輸出 JSON。`

  const reply = await chatPro(SYSTEM_PROMPT, userMsg)
  const parsed = parseAIResponse(reply)
  const contradictions: Contradiction[] = []
  for (const raw of parsed.contradictions) {
    const c = sanitizeContradiction(raw, promoterQuotes, detractorQuotes)
    if (c) contradictions.push(c)
  }

  return {
    service: cohort.service,
    serviceLabel: getServiceLabel(cohort.service),
    month: cohort.month,
    promoterCount: cohort.promoters.length,
    detractorCount: cohort.detractors.length,
    contradictions,
    summary: parsed.summary,
  }
}

export async function GET() {
  return NextResponse.json({ snapshot: readCounterInsights() })
}

export async function POST(req: NextRequest) {
  if (!isLocalMode()) {
    return NextResponse.json({ error: 'production not implemented' }, { status: 501 })
  }

  const months = listMonths()
  if (months.length === 0) {
    return NextResponse.json({ error: '尚未匯入月度問卷' }, { status: 400 })
  }
  const latestMonth = months[0]

  const body = await req.json().catch(() => ({}))
  const onlyService = typeof body.service === 'string' ? body.service : null

  const allCohorts = buildCohorts(latestMonth)
  const cohorts = onlyService ? allCohorts.filter(c => c.service === onlyService) : allCohorts

  if (cohorts.length === 0) {
    // 沒任何服務同時有 ≥5 個 promoter + ≥5 個 detractor
    if (allCohorts.length === 0) {
      return NextResponse.json(
        {
          error: `${latestMonth} 沒有任何服務 promoter ≥ ${MIN_TIER_SIZE} + detractor ≥ ${MIN_TIER_SIZE}，無法做對比分析`,
        },
        { status: 400 },
      )
    }
    return NextResponse.json({ error: `${onlyService} 在 ${latestMonth} 樣本不足` }, { status: 400 })
  }

  // Quota gate (N Pro calls for N cohorts)
  const proStatus = getQuotaStatus('gemini_chat_pro')
  if (proStatus.remaining < cohorts.length) {
    return NextResponse.json(
      {
        error: `Pro 配額不足：需要 ${cohorts.length}，剩 ${proStatus.remaining}`,
      },
      { status: 429 },
    )
  }

  const q = checkQuota('gemini_chat_pro')
  if (!q.ok) {
    return NextResponse.json({ error: quotaDeniedMessage('gemini_chat_pro', q.used, q.limit) }, { status: 429 })
  }

  const existing = readCounterInsights()
  const byService: ServiceCounterInsights[] =
    onlyService && existing && Array.isArray(existing.byService)
      ? existing.byService.filter(s => s.service !== onlyService)
      : []

  const errors: { service: string; error: string }[] = []
  for (const cohort of cohorts) {
    try {
      const result = await analyzeCohort(cohort)
      incrementQuota('gemini_chat_pro')
      byService.push(result)
    } catch (err) {
      errors.push({ service: cohort.service, error: (err as Error).message })
    }
  }

  if (byService.length === 0) {
    return NextResponse.json({ error: '所有服務的矛盾分析都失敗', errors }, { status: 500 })
  }

  byService.sort((a, b) => b.contradictions.length - a.contradictions.length)

  const snapshot: CounterInsightsSnapshot = {
    generatedAt: new Date().toISOString(),
    byService,
  }
  writeCounterInsights(snapshot)

  // skip listed services tracked for context
  const skippedSmall = listMetricsByMonth(latestMonth)
    .filter(m => !allCohorts.find(c => c.service === m.service))
    .map(m => m.service)

  return NextResponse.json({ snapshot, errors, skippedServices: skippedSmall })
}
