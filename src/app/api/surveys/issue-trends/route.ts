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
  type CanonicalIssue,
  type IssueKind,
  type IssueOccurrence,
  type IssueTrend,
  type IssueTrendsSnapshot,
} from '@/lib/issue-trends-store'

interface RawIssue {
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
    for (const theme of summary.themes) {
      out.push({
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

  // 2. Monthly metrics themes
  const months = listMonths()
  for (const month of months) {
    const metricsForMonth = listMetricsByMonth(month)
    for (const m of metricsForMonth) {
      const themes = m.themes
      if (!themes) continue
      for (const t of themes.complaint ?? []) {
        out.push({
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

function uniquePeriods(rawIssues: RawIssue[]): string[] {
  return Array.from(new Set(rawIssues.map(r => r.period))).sort()
}

const SYSTEM_PROMPT = `你是研究分析助手，擅長把跨問卷的議題對齊成統一座標系，看出時間趨勢。

任務：使用者會給你一份「raw_issues」陣列，每筆代表某時段（季度或月份）某問卷抽出的一個議題。請把它們**合併同義** 成 5-12 個 canonical 議題，並判斷每個議題的時間趨勢。

**嚴格輸出合法 JSON，不可包含 markdown code fence 或其他文字。**

格式：
{
  "issues": [
    {
      "title": "議題名稱（精簡，5-12 字）",
      "description": "為什麼這幾個 raw 議題屬於同一個（30-60 字）",
      "kind": "complaint" | "suggestion" | "mixed",
      "occurrence_indexes": [0, 3, 7],   // 在 raw_issues 陣列中的 0-based index
      "trend": "rising" | "falling" | "stable" | "single",
      "rationale": "趨勢判斷依據（20-50 字，只要時間軸 ≥ 2 個 period 就要明確說 up/down/stable）"
    }
  ],
  "summary": "整體 narrative：哪幾個議題長期惡化、哪些改善、哪些只是 single shot（80-150 字）"
}

判斷規則：
- 同義議題：例「上下車地址輸入問題」+「地址輸入搜尋邏輯」+「定位輸入錯誤」→ 同一個 canonical「地址輸入體驗」
- trend = "single" 當該議題只在 1 個 period 出現
- trend = "rising" / "falling" 當該議題 count 或 frequency 在時序上明顯上升 / 下降（≥ 30% 變化）
- trend = "stable" 當變化 < 30% 或方向不明
- raw_issues 已標好 period（如 2025-Q1 / 2026-03），請忠實對齊
- 不要創造 raw_issues 沒有的議題
- occurrence_indexes 必須是 raw_issues 中真實存在的 index
- 繁體中文`

interface AICanonicalIssue {
  title?: unknown
  description?: unknown
  kind?: unknown
  occurrence_indexes?: unknown
  trend?: unknown
  rationale?: unknown
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
  return {
    title,
    description: typeof raw.description === 'string' ? raw.description : '',
    kind,
    occurrences,
    trend,
    rationale: typeof raw.rationale === 'string' ? raw.rationale : '',
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

  const rawIssues = collectRawIssues()
  if (rawIssues.length === 0) {
    return NextResponse.json(
      { error: '沒有可用議題：請先對問卷跑「主題摘要」或匯入月度問卷' },
      { status: 400 },
    )
  }

  const periods = uniquePeriods(rawIssues)
  if (periods.length < 1) {
    return NextResponse.json({ error: '時段不足' }, { status: 400 })
  }

  const q = checkBoth(auth, 'gemini_chat_pro')
  if (!q.ok) {
    return NextResponse.json(
      {
        error: quotaDeniedMessage(q.reason),
        quota: getQuotaStatus('gemini_chat_pro'),
        userQuota: getUserQuotaStatus(auth.email, auth.role, 'gemini_chat_pro'),
      },
      { status: 429 },
    )
  }

  const userMsg = `raw_issues（共 ${rawIssues.length} 筆，跨 ${periods.length} 個時段：${periods.join(', ')}）：

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

  let parsed
  try {
    const reply = await chatPro(SYSTEM_PROMPT, userMsg)
    parsed = parseAIResponse(reply)
    incrementBoth(auth, 'gemini_chat_pro')
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }

  const canonical: CanonicalIssue[] = []
  for (const ai of parsed.issues) {
    const issue = sanitizeIssue(ai, rawIssues)
    if (issue) canonical.push(issue)
  }

  if (canonical.length === 0) {
    return NextResponse.json({ error: 'AI 回傳格式無法解析' }, { status: 500 })
  }

  const snapshot: IssueTrendsSnapshot = {
    generatedAt: new Date().toISOString(),
    periods,
    totalRawThemes: rawIssues.length,
    issues: canonical,
    summary: parsed.summary,
  }
  writeIssueTrends(snapshot)

  logAudit(auth, 'survey.issue_trends', null, {
    issues: canonical.length,
    periods: periods.length,
    rawThemes: rawIssues.length,
  })

  return NextResponse.json({ snapshot })
}
