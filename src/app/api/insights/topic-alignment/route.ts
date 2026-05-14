import { NextRequest, NextResponse } from 'next/server'
import { chatPro } from '@/lib/gemini'
import { checkQuota, incrementQuota, quotaDeniedMessage } from '@/lib/quota'
import { isLocalMode } from '@/lib/local-mode'
import { listMetricsByMonth, listMonths } from '@/lib/monthly-survey-store'
import {
  readAlignment,
  writeAlignment,
  type AlignedTopic,
  type OneSidedTopic,
} from '@/lib/topic-alignment-store'
import { mockSocialPosts } from '@/lib/mock-data'
import type { SocialPost } from '@/types'

export const runtime = 'nodejs'

interface SurveyEvidence {
  topic: string
  service: string
  serviceLabel: string
  pct: number
  count: number
  side: 'positive' | 'negative'
}

interface SocialEvidence {
  topic: string
  count: number
  examples: string[]
  side: 'positive' | 'negative' | 'neutral'
}

function collectSurveyTopics(month: string): SurveyEvidence[] {
  const metrics = listMetricsByMonth(month)
  const out: SurveyEvidence[] = []
  for (const m of metrics) {
    for (const c of m.complaint_dist.slice(0, 5)) {
      out.push({
        topic: c.label,
        service: m.service,
        serviceLabel: m.service,
        pct: c.pct,
        count: c.count,
        side: 'negative',
      })
    }
    for (const s of m.suggestion_dist.slice(0, 3)) {
      out.push({
        topic: s.label,
        service: m.service,
        serviceLabel: m.service,
        pct: s.pct,
        count: s.count,
        side: 'positive',
      })
    }
  }
  return out
}

function collectSocialTopics(): { evidence: SocialEvidence[]; total: number; usedMock: boolean } {
  let posts: SocialPost[] = []
  let usedMock = false
  try {
    // Lazy require so it doesn't fail in non-local mode at import time
    const store = require('@/lib/social-store') as typeof import('@/lib/social-store')
    posts = store.getPosts()
  } catch {
    posts = []
  }
  if (posts.length === 0) {
    posts = mockSocialPosts
    usedMock = true
  }

  const buckets = new Map<string, { count: number; examples: string[]; side: SocialEvidence['side'] }>()
  for (const p of posts) {
    const side: SocialEvidence['side'] = p.sentiment === 'negative' ? 'negative' : p.sentiment === 'positive' ? 'positive' : 'neutral'
    const key = `${side}::${p.keyword ?? '其他'}`
    if (!buckets.has(key)) buckets.set(key, { count: 0, examples: [], side })
    const b = buckets.get(key)!
    b.count += 1
    if (b.examples.length < 2 && p.title) b.examples.push(p.title)
  }

  const evidence: SocialEvidence[] = []
  for (const [key, b] of buckets) {
    const topic = key.split('::')[1]
    evidence.push({ topic, count: b.count, examples: b.examples, side: b.side })
  }
  evidence.sort((a, b) => b.count - a.count)
  return { evidence: evidence.slice(0, 20), total: posts.length, usedMock }
}

const SYSTEM_PROMPT = `你是 LINE GO 的洞察分析師。任務：把問卷議題與社群討論主題做對齊比對。

輸入：
- 問卷議題：選項 + 服務別 + 勾選比例（負面為主）
- 社群議題：keyword 分類 + 出現次數 + 範例貼文

任務輸出對照表：
- overlapping：兩邊都有提到的議題（用統一中文 topic 命名，≤14 字）
  - surveyEvidence：摘要問卷端證據（含服務名 + 比例，例：「計程車 12.3%」）
  - socialEvidence：摘要社群端證據（含次數，例：「社群 8 則負向」）
- socialOnly：只出現在社群、問卷沒對應選項的議題（值得作為下次問卷新增選項）
- surveyOnly：問卷常被勾、社群幾乎沒討論的議題（用戶私下抱怨但不公開）
- summary：1-2 句結論，量化重疊度與最該關注的 2-3 個議題

合併原則：
- 「媒合速度慢」「等候司機久」應視為同主題
- 不要重複主題；overlapping 出現的不要再放 socialOnly / surveyOnly
- overlapping 5 條內、各 only 3 條內

回傳純 JSON：
{
  "overlapping": [{ "topic": string, "surveyEvidence": string, "socialEvidence": string }],
  "socialOnly": [{ "topic": string, "evidence": string }],
  "surveyOnly": [{ "topic": string, "evidence": string }],
  "summary": string
}`

function buildUserMessage(survey: SurveyEvidence[], social: SocialEvidence[]): string {
  const lines: string[] = []
  lines.push('【問卷議題（top per service）】')
  for (const s of survey.slice(0, 30)) {
    const sideMark = s.side === 'negative' ? '抱怨' : '建議'
    lines.push(`- [${s.service} / ${sideMark}] ${s.topic}（${s.pct.toFixed(1)}%, ${s.count} 筆）`)
  }
  lines.push('')
  lines.push('【社群議題】')
  for (const s of social) {
    const sideMark = s.side === 'negative' ? '負向' : s.side === 'positive' ? '正向' : '中性'
    const ex = s.examples.length > 0 ? ` ｜ 例：${s.examples.join('；')}` : ''
    lines.push(`- [${sideMark}] ${s.topic}（${s.count} 則）${ex}`)
  }
  return lines.join('\n')
}

interface RawAlignment {
  overlapping?: unknown
  socialOnly?: unknown
  surveyOnly?: unknown
  summary?: unknown
}

function parseAlignment(raw: string): {
  overlapping: AlignedTopic[]
  socialOnly: OneSidedTopic[]
  surveyOnly: OneSidedTopic[]
  summary: string
} | null {
  const cleaned = raw.replace(/```json\s*|```/g, '').trim()
  try {
    const parsed = JSON.parse(cleaned) as RawAlignment

    const toAligned = (arr: unknown): AlignedTopic[] => {
      if (!Array.isArray(arr)) return []
      const out: AlignedTopic[] = []
      for (const it of arr) {
        const obj = it as Record<string, unknown>
        const topic = typeof obj.topic === 'string' ? obj.topic : ''
        if (!topic) continue
        out.push({
          topic,
          surveyEvidence: typeof obj.surveyEvidence === 'string' ? obj.surveyEvidence : undefined,
          socialEvidence: typeof obj.socialEvidence === 'string' ? obj.socialEvidence : undefined,
        })
      }
      return out.slice(0, 5)
    }

    const toOneSided = (arr: unknown): OneSidedTopic[] => {
      if (!Array.isArray(arr)) return []
      const out: OneSidedTopic[] = []
      for (const it of arr) {
        const obj = it as Record<string, unknown>
        const topic = typeof obj.topic === 'string' ? obj.topic : ''
        const evidence = typeof obj.evidence === 'string' ? obj.evidence : ''
        if (!topic) continue
        out.push({ topic, evidence })
      }
      return out.slice(0, 3)
    }

    return {
      overlapping: toAligned(parsed.overlapping),
      socialOnly: toOneSided(parsed.socialOnly),
      surveyOnly: toOneSided(parsed.surveyOnly),
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    }
  } catch {
    return null
  }
}

export async function GET() {
  return NextResponse.json({ snapshot: readAlignment() })
}

export async function POST(_req: NextRequest) {
  if (!isLocalMode()) {
    return NextResponse.json({ error: 'production not implemented' }, { status: 501 })
  }
  const months = listMonths()
  if (months.length === 0) {
    return NextResponse.json({ error: '尚未匯入月度問卷資料' }, { status: 400 })
  }
  const month = months[0]

  const survey = collectSurveyTopics(month)
  const social = collectSocialTopics()

  if (survey.length === 0) {
    return NextResponse.json({ error: '問卷無有效議題' }, { status: 400 })
  }

  const q = checkQuota('gemini_chat_pro')
  if (!q.ok) {
    return NextResponse.json({ error: quotaDeniedMessage('gemini_chat_pro', q.used, q.limit) }, { status: 429 })
  }

  const userMsg = buildUserMessage(survey, social.evidence)
  let parsed
  try {
    const raw = await chatPro(SYSTEM_PROMPT, userMsg)
    parsed = parseAlignment(raw)
    incrementQuota('gemini_chat_pro')
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }

  if (!parsed) {
    return NextResponse.json({ error: 'AI 回傳格式無法解析' }, { status: 500 })
  }

  const snapshot = {
    month,
    generatedAt: new Date().toISOString(),
    surveyEvidenceCount: survey.length,
    socialEvidenceCount: social.evidence.length,
    overlapping: parsed.overlapping,
    socialOnly: parsed.socialOnly,
    surveyOnly: parsed.surveyOnly,
    summary: parsed.summary,
  }
  writeAlignment(snapshot)
  return NextResponse.json({ snapshot, usedMockSocial: social.usedMock })
}
