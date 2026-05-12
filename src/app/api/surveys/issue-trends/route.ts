import { NextRequest, NextResponse } from 'next/server'
import { isLocalMode } from '@/lib/local-mode'
import { chatPro, wrapUntrusted } from '@/lib/gemini'
import {
  checkBoth,
  incrementBoth,
  getQuotaStatus,
  getUserQuotaStatus,
  quotaDeniedMessage,
} from '@/lib/quota'
import { requireEditor } from '@/lib/auth'
import { logAudit } from '@/lib/audit-log'
import { getLocalDocuments } from '@/lib/local-store'
import { getSurveySummary } from '@/lib/survey-summary-store'
import { listMetricsByMonth, listMonths } from '@/lib/monthly-survey-store'
import {
  readIssueTrends,
  writeIssueTrends,
  detectServiceFromTitle,
  getServiceLabel,
  type CanonicalIssue,
  type IssueAction,
  type IssueConfidence,
  type IssueImpact,
  type IssueKind,
  type IssueOccurrence,
  type IssueTrend,
  type IssueTrendsSnapshot,
  type ServiceTrends,
} from '@/lib/issue-trends-store'

interface RawIssue {
  service: string
  period: string
  periodKind: 'quarter' | 'month'
  source: string
  kind: IssueKind
  label: string
  description?: string
  count?: number
  frequency?: string
  evidence?: string
}

function detectQuarterFromTitle(title: string): string | null {
  const m = title.match(/(\d{4})\s*[Qq]\s*([1-4])/)
  if (m) return `${m[1]}-Q${m[2]}`
  return null
}

function collectRawIssues(): RawIssue[] {
  const out: RawIssue[] = []

  // 1. Per-document survey summaries (Q1.csv / Q2.csv etc.)
  const docs = getLocalDocuments('survey')
  for (const doc of docs) {
    const summary = getSurveySummary(doc.id)
    if (!summary?.themes?.length) continue
    const quarter = detectQuarterFromTitle(doc.title)
    const period = quarter ?? doc.title
    const periodKind: 'quarter' | 'month' = quarter ? 'quarter' : 'month'
    const service = detectServiceFromTitle(doc.title)
    for (const theme of summary.themes) {
      out.push({
        service,
        period,
        periodKind,
        source: doc.title,
        kind: 'mixed',
        label: theme.title,
        description: theme.description,
        frequency: theme.frequency_estimate,
        evidence: theme.quote,
      })
    }
  }

  // 2. Monthly metrics themes (already tagged with service)
  const months = listMonths()
  for (const month of months) {
    const metricsForMonth = listMetricsByMonth(month)
    for (const m of metricsForMonth) {
      const themes = m.themes
      if (!themes) continue
      for (const t of themes.complaint ?? []) {
        out.push({
          service: m.service,
          period: m.month,
          periodKind: 'month',
          source: `monthly:${m.service}`,
          kind: 'complaint',
          label: t.label,
          count: t.count,
          evidence: (t.examples ?? []).slice(0, 2).join(' / '),
        })
      }
      for (const t of themes.suggestion ?? []) {
        out.push({
          service: m.service,
          period: m.month,
          periodKind: 'month',
          source: `monthly:${m.service}`,
          kind: 'suggestion',
          label: t.label,
          count: t.count,
          evidence: (t.examples ?? []).slice(0, 2).join(' / '),
        })
      }
    }
  }

  return out
}

function groupByService(rawIssues: RawIssue[]): Map<string, RawIssue[]> {
  const groups = new Map<string, RawIssue[]>()
  for (const r of rawIssues) {
    const arr = groups.get(r.service) ?? []
    arr.push(r)
    groups.set(r.service, arr)
  }
  return groups
}

function uniquePeriodsOf(issues: RawIssue[]): string[] {
  return Array.from(new Set(issues.map(r => r.period))).sort()
}

const SYSTEM_PROMPT = `你是研究分析助手，擅長把跨問卷的議題對齊成統一座標系，看出時間趨勢，並提供 actionable 的決策建議。

**重要：本次處理的所有 raw_issues 都來自同一個服務別**（例：計程車）。請只對這一個服務做議題對齊，不要試著跨服務泛化。

任務：
1. 把 raw_issues 合併同義 成 3-12 個 canonical 議題
2. 判斷每個議題的時間趨勢
3. 為每個議題提供 **Decision Layer**：impact / confidence / recommended_action

**嚴格輸出合法 JSON，不可包含 markdown code fence 或其他文字。**

格式：
{
  "issues": [
    {
      "title": "議題名稱（精簡，5-12 字）",
      "description": "為什麼這幾個 raw 議題屬於同一個（30-60 字）",
      "kind": "complaint" | "suggestion" | "mixed",
      "occurrence_indexes": [0, 3, 7],
      "trend": "rising" | "falling" | "stable" | "single",
      "rationale": "趨勢判斷依據（20-50 字）",
      "impact": "high" | "medium" | "low",
      "confidence": "high" | "medium" | "low",
      "recommended_action": "prioritize" | "investigate" | "monitor" | "defer",
      "action_rationale": "為什麼這個建議（30-60 字）"
    }
  ],
  "summary": "整體 narrative：點出最高優先的議題 + 為什麼（80-150 字）"
}

判斷規則：

【trend】
- "single"：只在 1 個 period 出現
- "rising" / "falling"：count 或 frequency 在時序上明顯上升 / 下降（≥ 30%）
- "stable"：變化 < 30% 或方向不明

【impact】議題對使用者體驗 / 業務的影響
- "high"：核心流程受阻（叫不到車、付款失敗、安全顧慮）、或抱怨佔比 > 20%
- "medium"：明顯摩擦但仍可完成任務（介面難用、優惠不清楚）、或佔比 5-20%
- "low"：邊緣抱怨（特定情境、單一裝置）、佔比 < 5%

【confidence】證據強度
- "high"：≥ 2 期出現 + raw evidence count 充足 + 跨來源（如季度 + 月度都有）
- "medium"：1-2 期出現 + 中等證據量
- "low"：只在 1 個 source 出現、或樣本數明顯偏少（< 5）、或內容含糊

【recommended_action】
- "prioritize"：impact high + (trend rising 或 confidence high) → 排入下個 sprint
- "investigate"：impact medium-high 但 confidence 不夠（需要更多訊息確認） → 開研究訪談 / 補資料
- "monitor"：trend stable / falling，或 impact medium 但已知正在改善 → 持續觀察
- "defer"：impact low 且 confidence low → 暫不處理

其他：
- 同義議題：例「上下車地址輸入問題」+「地址輸入搜尋邏輯」→ 同一個 canonical
- raw_issues 已標好 period（如 2025-Q1 / 2026-03），請忠實對齊
- 不要創造 raw_issues 沒有的議題
- occurrence_indexes 必須是 raw_issues 中真實存在的 0-based index
- summary 必須提到 prioritize 級議題（如果有）
- 繁體中文`

interface AICanonicalIssue {
  title?: unknown
  description?: unknown
  kind?: unknown
  occurrence_indexes?: unknown
  trend?: unknown
  rationale?: unknown
  impact?: unknown
  confidence?: unknown
  recommended_action?: unknown
  action_rationale?: unknown
}

function parseAIResponse(raw: string): { issues: AICanonicalIssue[]; summary: string } {
  const cleaned = raw.replace(/^```json\s*|\s*```$/g, '').replace(/^```\s*|\s*```$/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end < 0) throw new Error('AI 回傳非 JSON')
  const obj = JSON.parse(cleaned.slice(start, end + 1))
  if (!Array.isArray(obj.issues)) throw new Error('AI 回傳缺少 issues 陣列')
  return {
    issues: obj.issues as AICanonicalIssue[],
    summary: typeof obj.summary === 'string' ? obj.summary : '',
  }
}

function sanitizeIssue(
  raw: AICanonicalIssue,
  rawIssues: RawIssue[],
): CanonicalIssue | null {
  const title = typeof raw.title === 'string' ? raw.title.trim() : ''
  if (!title) return null
  const kind: IssueKind = raw.kind === 'complaint' || raw.kind === 'suggestion' ? raw.kind : 'mixed'
  const trend: IssueTrend =
    raw.trend === 'rising' || raw.trend === 'falling' || raw.trend === 'single'
      ? raw.trend
      : 'stable'
  const indexes = Array.isArray(raw.occurrence_indexes)
    ? raw.occurrence_indexes
        .map(n => Number(n))
        .filter(n => Number.isInteger(n) && n >= 0 && n < rawIssues.length)
    : []
  if (indexes.length === 0) return null
  const occurrences: IssueOccurrence[] = indexes.map(i => {
    const r = rawIssues[i]
    return {
      period: r.period,
      periodKind: r.periodKind,
      source: r.source,
      rawLabel: r.label,
      count: r.count,
      frequency: r.frequency,
      evidence: r.evidence,
    }
  })
  const impact: IssueImpact | undefined =
    raw.impact === 'high' || raw.impact === 'medium' || raw.impact === 'low'
      ? raw.impact
      : undefined
  const confidence: IssueConfidence | undefined =
    raw.confidence === 'high' || raw.confidence === 'medium' || raw.confidence === 'low'
      ? raw.confidence
      : undefined
  const recommended_action: IssueAction | undefined =
    raw.recommended_action === 'prioritize' ||
    raw.recommended_action === 'investigate' ||
    raw.recommended_action === 'monitor' ||
    raw.recommended_action === 'defer'
      ? raw.recommended_action
      : undefined
  return {
    title,
    description: typeof raw.description === 'string' ? raw.description : '',
    kind,
    occurrences,
    trend,
    rationale: typeof raw.rationale === 'string' ? raw.rationale : '',
    impact,
    confidence,
    recommended_action,
    action_rationale:
      typeof raw.action_rationale === 'string' ? raw.action_rationale : undefined,
  }
}

async function canonicalizeService(
  service: string,
  rawIssues: RawIssue[],
): Promise<ServiceTrends> {
  const periods = uniquePeriodsOf(rawIssues)
  const userMsg = `服務別：${getServiceLabel(service)}（service code：${service}）
時段：${periods.join(', ')}
raw_issues（共 ${rawIssues.length} 筆）：

${wrapUntrusted(
  rawIssues
    .map(
      (r, i) =>
        `[${i}] period=${r.period} (${r.periodKind}) | source=${r.source} | kind=${r.kind} | label=${r.label}${
          r.description ? ` | description=${r.description}` : ''
        }${r.count !== undefined ? ` | count=${r.count}` : ''}${r.frequency ? ` | frequency=${r.frequency}` : ''}${
          r.evidence ? ` | evidence=${r.evidence.slice(0, 200)}` : ''
        }`,
    )
    .join('\n'),
  'RAW_ISSUES',
)}

請輸出 canonical issues + trend JSON。`

  const reply = await chatPro(SYSTEM_PROMPT, userMsg)
  const parsed = parseAIResponse(reply)
  const canonical: CanonicalIssue[] = []
  for (const ai of parsed.issues) {
    const issue = sanitizeIssue(ai, rawIssues)
    if (issue) canonical.push(issue)
  }
  return {
    service,
    serviceLabel: getServiceLabel(service),
    periods,
    rawCount: rawIssues.length,
    issues: canonical,
    summary: parsed.summary,
  }
}

export async function GET() {
  return NextResponse.json({ snapshot: readIssueTrends() })
}

export async function POST(req: NextRequest) {
  const auth = await requireEditor(req)
  if (auth instanceof NextResponse) return auth

  if (!isLocalMode()) {
    return NextResponse.json({ error: 'production not implemented' }, { status: 501 })
  }

  const body = await req.json().catch(() => ({}))
  const onlyService = typeof body.service === 'string' ? body.service : null

  const rawIssues = collectRawIssues()
  if (rawIssues.length === 0) {
    return NextResponse.json(
      { error: '沒有可用議題：請先對問卷跑「主題摘要」或匯入月度問卷' },
      { status: 400 },
    )
  }

  const allGroups = groupByService(rawIssues)
  const serviceList = onlyService
    ? [onlyService].filter(s => allGroups.has(s))
    : Array.from(allGroups.keys())

  if (serviceList.length === 0) {
    return NextResponse.json({ error: '沒有對應服務的議題資料' }, { status: 400 })
  }

  // Quota: each service consumes 1 Pro call. Pre-check total before starting.
  const proStatus = getQuotaStatus('gemini_chat_pro')
  const userPro = getUserQuotaStatus(auth.email, auth.role, 'gemini_chat_pro')
  const need = serviceList.length
  if (proStatus.remaining < need || userPro.remaining < need) {
    return NextResponse.json(
      {
        error: `Pro 配額不足：需要 ${need}（每服務 1 份），全站剩 ${proStatus.remaining}、個人剩 ${userPro.remaining}`,
        quota: proStatus,
        userQuota: userPro,
      },
      { status: 429 },
    )
  }

  const q = checkBoth(auth, 'gemini_chat_pro')
  if (!q.ok) {
    return NextResponse.json(
      { error: quotaDeniedMessage(q.reason), quota: proStatus, userQuota: userPro },
      { status: 429 },
    )
  }

  // Either start fresh OR merge into existing snapshot (when a single service is regenerated)
  const existing = readIssueTrends()
  const byService: ServiceTrends[] = onlyService && existing && Array.isArray(existing.byService)
    ? existing.byService.filter(s => s.service !== onlyService)
    : []

  const errors: { service: string; error: string }[] = []
  for (const service of serviceList) {
    const issuesForService = allGroups.get(service) ?? []
    if (issuesForService.length === 0) continue
    try {
      const result = await canonicalizeService(service, issuesForService)
      incrementBoth(auth, 'gemini_chat_pro')
      byService.push(result)
    } catch (err) {
      errors.push({ service, error: (err as Error).message })
    }
  }

  if (byService.length === 0) {
    return NextResponse.json(
      { error: '所有服務的議題對齊都失敗', errors },
      { status: 500 },
    )
  }

  byService.sort((a, b) => b.rawCount - a.rawCount)

  const snapshot: IssueTrendsSnapshot = {
    generatedAt: new Date().toISOString(),
    totalRawThemes: rawIssues.length,
    byService,
  }
  writeIssueTrends(snapshot)

  logAudit(auth, 'survey.issue_trends', null, {
    services: serviceList.length,
    issues: byService.reduce((s, st) => s + st.issues.length, 0),
    rawThemes: rawIssues.length,
    errors: errors.length,
  })

  return NextResponse.json({ snapshot, errors })
}
