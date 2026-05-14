import { NextRequest, NextResponse } from 'next/server'
import { chatPro } from '@/lib/gemini'
import { checkQuota, incrementQuota, getQuotaStatus, quotaDeniedMessage } from '@/lib/quota'
import { isLocalMode } from '@/lib/local-mode'
import {
  readCompetitorAlignment,
  writeCompetitorAlignment,
  type CompetitorAlignmentSnapshot,
  type CompetitorCounts,
} from '@/lib/competitor-alignment-store'
import { listMetricsByMonth, listMonths } from '@/lib/monthly-survey-store'

export const runtime = 'nodejs'

const COMPETITORS = ['Uber', 'Yoxi', '55688'] as const
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY

const NEGATIVE_KEYWORDS = ['爛', '垃圾', '難用', '貴', '騙', '抱怨', '客訴', '糟', '差', '失望', '退費', '無法', '不滿', '太久', '麻煩', '故障', '錯誤', '當機']
const POSITIVE_KEYWORDS = ['推', '讚', '好用', '喜歡', '不錯', '推薦', '方便', '快速', '便宜', '優質', '滿意', '舒服']

function classifySentiment(text: string): 'positive' | 'negative' | 'neutral' {
  const neg = NEGATIVE_KEYWORDS.filter(k => text.includes(k)).length
  const pos = POSITIVE_KEYWORDS.filter(k => text.includes(k)).length
  if (neg > pos && neg >= 1) return 'negative'
  if (pos > neg && pos >= 1) return 'positive'
  return 'neutral'
}

interface FirecrawlItem {
  url?: string
  title?: string
  description?: string
}

async function firecrawlSearch(competitor: string): Promise<FirecrawlItem[]> {
  const query = `"${competitor}" (site:dcard.tw OR site:ptt.cc OR site:pttweb.cc OR site:mobile01.com OR site:threads.com OR site:threads.net)`
  const res = await fetch('https://api.firecrawl.dev/v1/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
    },
    body: JSON.stringify({
      query,
      limit: 10,
      country: 'tw',
      lang: 'zh-TW',
      tbs: 'qdr:y',
    }),
  })
  const data = await res.json()
  return (data?.data?.web || data?.data || []) as FirecrawlItem[]
}

interface CompetitorPost {
  competitor: string
  title: string
  description: string
  sentiment: 'positive' | 'negative' | 'neutral'
}

async function fetchCompetitorPosts(): Promise<{ posts: CompetitorPost[]; counts: Record<string, CompetitorCounts> }> {
  const posts: CompetitorPost[] = []
  const counts: Record<string, CompetitorCounts> = {}
  for (const competitor of COMPETITORS) {
    counts[competitor] = { positive: 0, negative: 0, neutral: 0, total: 0 }
    try {
      const results = await firecrawlSearch(competitor)
      incrementQuota('firecrawl_search')
      for (const item of results) {
        if (!item.url) continue
        const title = item.title ?? ''
        const description = item.description ?? ''
        const sentiment = classifySentiment(`${title} ${description}`)
        posts.push({ competitor, title, description, sentiment })
        counts[competitor][sentiment] += 1
        counts[competitor].total += 1
      }
    } catch (err) {
      console.error(`fetch ${competitor} failed:`, err)
    }
  }
  return { posts, counts }
}

function getOurNegatives(): { topics: string[]; counts: CompetitorCounts } {
  const months = listMonths()
  const month = months[0]
  if (!month) return { topics: [], counts: { positive: 0, negative: 0, neutral: 0, total: 0 } }
  const metrics = listMetricsByMonth(month)
  const topics = new Set<string>()
  let positive = 0
  let negative = 0
  for (const m of metrics) {
    for (const c of m.complaint_dist.slice(0, 5)) topics.add(c.label)
    positive += m.promoters
    negative += m.detractors
  }
  const total = metrics.reduce((s, m) => s + m.responses, 0)
  return {
    topics: Array.from(topics),
    counts: { positive, negative, neutral: total - positive - negative, total },
  }
}

const SYSTEM_PROMPT = `你是 LINE GO 的競品分析師。任務：把競品的社群討論議題與自家 (LINE GO) 的問卷議題做對齊。

輸入：
- 自家：問卷中常被勾選的負向議題（complaint 選項）
- 競品：3 個競品 (Uber / Yoxi / 55688) 的社群貼文摘要 + 我們判斷的 sentiment

任務輸出：
- sharedIssues：兩邊都有出現的議題（自家問卷有對應選項、競品社群也有對應討論）
  - topic: 統一的中文議題名稱（≤14 字）
  - ours: 自家端的證據（引用問卷選項名稱）
  - competitor: 競品端的證據（哪個競品 + 大致狀況）
- competitorOnly：只在競品出現、自家沒對應問卷選項的議題（值得關注的競品弱點 / 行業共通議題）
- ourOnly：只在自家問卷出現、社群競品端沒明顯討論的議題
- summary：1-2 句結論，量化重疊度與最值得學習 / 警惕的 2-3 個議題

合併原則：
- 「車資過高」「太貴」應視為同主題
- 不要重複；shared 出現的不要再放 ourOnly / competitorOnly
- 各 3-5 條內

回傳純 JSON：
{
  "sharedIssues": [{ "topic": string, "ours": string, "competitor": string }],
  "competitorOnly": [{ "topic": string, "competitor": string, "evidence": string }],
  "ourOnly": [{ "topic": string, "evidence": string }],
  "summary": string
}`

function buildUserMessage(ourTopics: string[], competitorPosts: CompetitorPost[]): string {
  const lines: string[] = []
  lines.push('【自家問卷議題】（complaint 選項常被勾選）')
  for (const t of ourTopics.slice(0, 25)) lines.push(`- ${t}`)
  lines.push('')

  const byComp = new Map<string, CompetitorPost[]>()
  for (const p of competitorPosts) {
    if (!byComp.has(p.competitor)) byComp.set(p.competitor, [])
    byComp.get(p.competitor)!.push(p)
  }
  for (const [c, items] of byComp) {
    lines.push(`【競品 ${c}】共 ${items.length} 則`)
    const negatives = items.filter(p => p.sentiment === 'negative').slice(0, 8)
    const positives = items.filter(p => p.sentiment === 'positive').slice(0, 5)
    if (negatives.length > 0) {
      lines.push(`負向 (${negatives.length}):`)
      for (const p of negatives) lines.push(`  - 「${p.title}」 ${p.description ? `${p.description.slice(0, 80)}` : ''}`)
    }
    if (positives.length > 0) {
      lines.push(`正向 (${positives.length}):`)
      for (const p of positives) lines.push(`  - 「${p.title}」 ${p.description ? `${p.description.slice(0, 60)}` : ''}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

interface RawAlignment {
  sharedIssues?: unknown
  competitorOnly?: unknown
  ourOnly?: unknown
  summary?: unknown
}

function parseAlignment(raw: string) {
  const cleaned = raw.replace(/```json\s*|```/g, '').trim()
  try {
    const parsed = JSON.parse(cleaned) as RawAlignment

    const toShared = (arr: unknown) => {
      if (!Array.isArray(arr)) return []
      return arr
        .map(it => {
          const obj = it as Record<string, unknown>
          return {
            topic: typeof obj.topic === 'string' ? obj.topic : '',
            ours: typeof obj.ours === 'string' ? obj.ours : '',
            competitor: typeof obj.competitor === 'string' ? obj.competitor : '',
          }
        })
        .filter(it => it.topic)
        .slice(0, 5)
    }
    const toCompOnly = (arr: unknown) => {
      if (!Array.isArray(arr)) return []
      return arr
        .map(it => {
          const obj = it as Record<string, unknown>
          return {
            topic: typeof obj.topic === 'string' ? obj.topic : '',
            competitor: typeof obj.competitor === 'string' ? obj.competitor : '',
            evidence: typeof obj.evidence === 'string' ? obj.evidence : '',
          }
        })
        .filter(it => it.topic)
        .slice(0, 5)
    }
    const toOurOnly = (arr: unknown) => {
      if (!Array.isArray(arr)) return []
      return arr
        .map(it => {
          const obj = it as Record<string, unknown>
          return {
            topic: typeof obj.topic === 'string' ? obj.topic : '',
            evidence: typeof obj.evidence === 'string' ? obj.evidence : '',
          }
        })
        .filter(it => it.topic)
        .slice(0, 5)
    }

    return {
      sharedIssues: toShared(parsed.sharedIssues),
      competitorOnly: toCompOnly(parsed.competitorOnly),
      ourOnly: toOurOnly(parsed.ourOnly),
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    }
  } catch {
    return null
  }
}

export async function GET() {
  return NextResponse.json({
    snapshot: readCompetitorAlignment(),
    quota: {
      firecrawl: getQuotaStatus('firecrawl_search'),
      chat: getQuotaStatus('gemini_chat'),
    },
  })
}

export async function POST(_req: NextRequest) {
  if (!isLocalMode()) {
    return NextResponse.json({ error: 'production not implemented' }, { status: 501 })
  }
  if (!FIRECRAWL_API_KEY || FIRECRAWL_API_KEY.includes('placeholder')) {
    return NextResponse.json({ error: 'FIRECRAWL_API_KEY not configured' }, { status: 500 })
  }

  const fcQ = getQuotaStatus('firecrawl_search')
  if (fcQ.remaining < COMPETITORS.length) {
    return NextResponse.json(
      { error: `Firecrawl 額度不足（剩 ${fcQ.remaining}/${fcQ.limit}，需要 ${COMPETITORS.length}）`, quota: fcQ },
      { status: 429 },
    )
  }
  const chatQ = checkQuota('gemini_chat_pro')
  if (!chatQ.ok) {
    return NextResponse.json({ error: quotaDeniedMessage('gemini_chat_pro', chatQ.used, chatQ.limit) }, { status: 429 })
  }

  const our = getOurNegatives()
  if (our.topics.length === 0) {
    return NextResponse.json({ error: '尚未匯入月度問卷，無法對標' }, { status: 400 })
  }

  const { posts: competitorPosts, counts: countsByCompetitor } = await fetchCompetitorPosts()
  if (competitorPosts.length === 0) {
    return NextResponse.json({ error: '競品搜尋無結果' }, { status: 500 })
  }

  const userMsg = buildUserMessage(our.topics, competitorPosts)
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

  const snapshot: CompetitorAlignmentSnapshot = {
    generatedAt: new Date().toISOString(),
    competitors: [...COMPETITORS],
    countsByCompetitor,
    ourCounts: our.counts,
    sharedIssues: parsed.sharedIssues,
    competitorOnly: parsed.competitorOnly,
    ourOnly: parsed.ourOnly,
    summary: parsed.summary,
  }
  writeCompetitorAlignment(snapshot)
  return NextResponse.json({ snapshot })
}
