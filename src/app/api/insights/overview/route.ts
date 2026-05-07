import { NextRequest, NextResponse } from 'next/server'
import { chatPro } from '@/lib/gemini'
import { checkBoth, incrementBoth, quotaDeniedMessage } from '@/lib/quota'
import { requireEditor } from '@/lib/auth'
import { isLocalMode } from '@/lib/local-mode'
import {
  getMonthlyOverview,
  listMetricsByMonth,
  listMonths,
} from '@/lib/monthly-survey-store'
import {
  readInsights,
  writeInsights,
  type DashboardInsight,
} from '@/lib/dashboard-insights-store'
import { surveyServiceLabel } from '@/types'

export const runtime = 'nodejs'

interface SurveyCandidate {
  month: string
  overall: ReturnType<typeof getMonthlyOverview>
  bestService: { service: string; nps: number; satisfied_pct: number } | null
  worstService: { service: string; nps: number; satisfied_pct: number } | null
  topSuggestion: { service: string; label: string; pct: number } | null
  topComplaint: { service: string; label: string; pct: number } | null
}

interface SocialCandidate {
  total: number
  positive: number
  negative: number
  neutral: number
  topNegativeKeywords: string[]
}

function buildSurveyCandidates(): SurveyCandidate | null {
  const overall = getMonthlyOverview()
  if (!overall) return null
  const monthMetrics = listMetricsByMonth(overall.month)
  const ranked = monthMetrics.filter(m => m.responses >= 5)

  const sortedNps = [...ranked].sort((a, b) => a.nps - b.nps)
  const worst = sortedNps[0]
  const best = sortedNps[sortedNps.length - 1]

  let topSugg: SurveyCandidate['topSuggestion'] = null
  let topComp: SurveyCandidate['topComplaint'] = null
  for (const m of monthMetrics) {
    const s0 = m.suggestion_dist[0]
    if (s0 && (!topSugg || s0.pct > topSugg.pct)) {
      topSugg = { service: m.service, label: s0.label, pct: s0.pct }
    }
    const c0 = m.complaint_dist[0]
    if (c0 && (!topComp || c0.pct > topComp.pct)) {
      topComp = { service: m.service, label: c0.label, pct: c0.pct }
    }
  }

  return {
    month: overall.month,
    overall,
    bestService: best ? { service: best.service, nps: best.nps, satisfied_pct: best.satisfied_pct } : null,
    worstService: worst ? { service: worst.service, nps: worst.nps, satisfied_pct: worst.satisfied_pct } : null,
    topSuggestion: topSugg,
    topComplaint: topComp,
  }
}

async function buildSocialCandidates(): Promise<SocialCandidate | null> {
  if (!isLocalMode()) return null
  const { getPosts } = await import('@/lib/social-store')
  const posts = getPosts()
  if (posts.length === 0) return null
  const negative = posts.filter(p => p.sentiment === 'negative')
  const negKeywords = new Map<string, number>()
  for (const p of negative) {
    if (p.keyword) negKeywords.set(p.keyword, (negKeywords.get(p.keyword) ?? 0) + 1)
  }
  const top = Array.from(negKeywords.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k)
  return {
    total: posts.length,
    positive: posts.filter(p => p.sentiment === 'positive').length,
    negative: negative.length,
    neutral: posts.filter(p => p.sentiment === 'neutral').length,
    topNegativeKeywords: top,
  }
}

const SYSTEM_PROMPT = `你是 LINE GO 的洞察分析師。任務：把多源數據濃縮成 5 條儀表板洞察。

規則：
- 共輸出 **5 條** 洞察，每條獨立、可行動、不重複
- 每條包含：
  - tone：positive（亮點）／warning（需注意）／info（中性觀察）
  - title：≤18 中文字，能立刻看懂在講什麼
  - body：1–2 句說明，包含具體數字（保留小數位）+ 原因或建議方向
  - source：survey / social / alert / mixed
- **必須** 使用提供的具體數字，不可捏造
- 至少 2 條 warning（除非完全沒有負面訊號）
- 多樣性：盡量涵蓋不同服務 / 不同來源（問卷 + 社群）
- 語氣中性專業，不要使用 emoji 或誇張詞

回傳純 JSON：
{
  "insights": [
    { "tone": "warning"|"positive"|"info", "title": string, "body": string, "source": "survey"|"social"|"alert"|"mixed" }
  ]
}`

function buildUserMessage(
  survey: SurveyCandidate | null,
  social: SocialCandidate | null,
): string {
  const parts: string[] = []

  if (survey) {
    parts.push(`【月度問卷 ${survey.month}】`)
    if (survey.overall) {
      const o = survey.overall
      parts.push(
        `- 總填答 ${o.responses.toLocaleString()} 筆 ・ 滿意度 ${o.satisfied_pct.toFixed(1)}% ・ 標準化滿意分 ${((o.satisfaction_avg / 5) * 100).toFixed(1)}% ・ NPS ${o.nps >= 0 ? '+' : ''}${o.nps.toFixed(1)}`,
      )
    }
    if (survey.bestService) {
      parts.push(
        `- 表現最佳服務：${surveyServiceLabel(survey.bestService.service)}，NPS ${survey.bestService.nps.toFixed(1)}、滿意度 ${survey.bestService.satisfied_pct.toFixed(1)}%`,
      )
    }
    if (survey.worstService) {
      parts.push(
        `- 表現最弱服務：${surveyServiceLabel(survey.worstService.service)}，NPS ${survey.worstService.nps.toFixed(1)}、滿意度 ${survey.worstService.satisfied_pct.toFixed(1)}%`,
      )
    }
    if (survey.topSuggestion) {
      parts.push(
        `- 最常被勾選的正面建議：${surveyServiceLabel(survey.topSuggestion.service)} 的「${survey.topSuggestion.label}」(${survey.topSuggestion.pct.toFixed(1)}%)`,
      )
    }
    if (survey.topComplaint) {
      parts.push(
        `- 最常被勾選的負面回饋：${surveyServiceLabel(survey.topComplaint.service)} 的「${survey.topComplaint.label}」(${survey.topComplaint.pct.toFixed(1)}%)`,
      )
    }
  } else {
    parts.push('【月度問卷】尚無資料')
  }

  parts.push('')
  if (social) {
    parts.push(`【社群監測】共 ${social.total} 則貼文 ・ 正向 ${social.positive} ／ 負向 ${social.negative} ／ 中性 ${social.neutral}`)
    if (social.topNegativeKeywords.length > 0) {
      parts.push(`- 負向討論主要關鍵字：${social.topNegativeKeywords.join('、')}`)
    }
  } else {
    parts.push('【社群監測】無近期資料')
  }

  return parts.join('\n')
}

function parseInsights(raw: string): DashboardInsight[] {
  const cleaned = raw.replace(/```json\s*|```/g, '').trim()
  try {
    const parsed = JSON.parse(cleaned) as { insights?: unknown }
    if (!Array.isArray(parsed.insights)) return []
    const items: DashboardInsight[] = []
    for (const it of parsed.insights) {
      const obj = it as Record<string, unknown>
      const tone: DashboardInsight['tone'] =
        obj.tone === 'positive' || obj.tone === 'warning' || obj.tone === 'info' ? obj.tone : 'info'
      const source: DashboardInsight['source'] =
        obj.source === 'survey' || obj.source === 'social' || obj.source === 'alert' || obj.source === 'mixed'
          ? obj.source
          : 'mixed'
      const title = typeof obj.title === 'string' ? obj.title : ''
      const body = typeof obj.body === 'string' ? obj.body : ''
      if (title && body) items.push({ tone, source, title, body })
    }
    return items.slice(0, 5)
  } catch {
    return []
  }
}

export async function GET() {
  const snap = readInsights()
  return NextResponse.json({
    snapshot: snap,
    months: listMonths(),
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireEditor(req)
  if (auth instanceof NextResponse) return auth

  if (!isLocalMode()) {
    return NextResponse.json({ error: 'production not implemented' }, { status: 501 })
  }

  const survey = buildSurveyCandidates()
  const social = await buildSocialCandidates()

  if (!survey && !social) {
    return NextResponse.json(
      { error: '尚無可用資料：請先匯入月度問卷或抓取社群貼文' },
      { status: 400 },
    )
  }

  const q = checkBoth(auth, 'gemini_chat_pro')
  if (!q.ok) {
    return NextResponse.json({ error: quotaDeniedMessage(q.reason) }, { status: 429 })
  }

  const userMsg = buildUserMessage(survey, social)
  let insights: DashboardInsight[] = []
  try {
    const raw = await chatPro(SYSTEM_PROMPT, userMsg)
    insights = parseInsights(raw)
    incrementBoth(auth, 'gemini_chat_pro')
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }

  if (insights.length === 0) {
    return NextResponse.json({ error: 'AI 回傳格式無法解析' }, { status: 500 })
  }

  const snapshot = {
    generatedAt: new Date().toISOString(),
    insights,
    context: { survey, social },
  }
  writeInsights(snapshot)
  return NextResponse.json({ snapshot })
}
