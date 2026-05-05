import { NextResponse } from 'next/server'
import { chat } from '@/lib/gemini'
import { getPosts, getAnalysis, saveAnalysis, assignSentiments } from '@/lib/social-store'
import { checkQuota, incrementQuota, getQuotaStatus } from '@/lib/quota'
import type { SocialPost } from '@/types'

type Category = '租車' | '計程車' | '共享機車' | 'LINE GO 總覽'

function classifyCategory(post: SocialPost): Category {
  const text = `${post.title ?? ''} ${post.description ?? ''} ${post.keyword ?? ''}`.toLowerCase()
  if (/租車|自駕|hire|rent\s*a\s*car|租個車/.test(text)) return '租車'
  if (/計程車|taxi|叫車|司機|uber|yoxi|55688/.test(text)) return '計程車'
  if (/機車|wemo|goshare|共享機車|電動機車/.test(text)) return '共享機車'
  return 'LINE GO 總覽'
}

interface AnalyzeResult {
  positive: { word: string; count: number }[]
  negative: { word: string; count: number }[]
  sentimentByPostId: Record<number, 'positive' | 'neutral' | 'negative'>
}

function buildPrompt(posts: SocialPost[], category: Category): string {
  const sample = posts
    .slice(0, 60)
    .map(p => `#${p.id} [${p.platform}] ${p.title ?? ''} | ${p.description ?? ''}`)
    .join('\n')

  return `以下是關於「${category}」分類的社群討論貼文，請做兩件事：

1. 為每篇貼文判斷情緒（positive / neutral / negative）
2. 從所有貼文的標題與描述中，抽取最常出現的「正向評價詞」與「負向評價詞」（中文短詞，2~6 字，聚焦服務體驗與感受，例如「乾淨」「便宜」「客服爛」「加價不實」）
   - 每類最多 20 個
   - 忽略品牌名（LINE GO、WeMo 等）與平台名（PTT、Dcard 等）
   - 忽略通用動詞與無意義詞（如「使用」「體驗」「分享」）

貼文：
${sample}

請用以下 JSON 格式回覆（不要有任何其他文字、不要 markdown 標記）：
{
  "sentimentByPostId": { "1": "positive", "2": "negative", ... },
  "positive": [{"word": "乾淨", "count": 12}, ...],
  "negative": [{"word": "客服爛", "count": 8}, ...]
}`
}

function parseJSON<T>(text: string): T | null {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '')
  try {
    return JSON.parse(cleaned)
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        return JSON.parse(match[0])
      } catch {
        return null
      }
    }
    return null
  }
}

export async function GET() {
  return NextResponse.json({ analysis: getAnalysis(), quota: getQuotaStatus('gemini_chat') })
}

export async function POST() {
  const q = checkQuota('gemini_chat')
  if (!q.ok) {
    return NextResponse.json(
      { error: `AI 額度已用完 (${q.used}/${q.limit})` },
      { status: 429 }
    )
  }

  const allPosts = getPosts()
  if (!allPosts.length) {
    return NextResponse.json({ error: '尚無社群貼文，請先抓取' }, { status: 400 })
  }

  const categories: Category[] = ['租車', '計程車', '共享機車', 'LINE GO 總覽']
  const postsByCategory = new Map<Category, SocialPost[]>()
  for (const c of categories) postsByCategory.set(c, [])
  for (const p of allPosts) postsByCategory.get(classifyCategory(p))!.push(p)

  const results: Record<Category, AnalyzeResult> = {
    '租車': { positive: [], negative: [], sentimentByPostId: {} },
    '計程車': { positive: [], negative: [], sentimentByPostId: {} },
    '共享機車': { positive: [], negative: [], sentimentByPostId: {} },
    'LINE GO 總覽': { positive: [], negative: [], sentimentByPostId: {} },
  }

  const mergedSentiments: Record<number, 'positive' | 'neutral' | 'negative'> = {}
  const errors: string[] = []

  for (const cat of categories) {
    const cPosts = cat === 'LINE GO 總覽' ? allPosts : postsByCategory.get(cat)!
    if (!cPosts.length) continue

    try {
      const prompt = buildPrompt(cPosts, cat)
      const answer = await chat('你是社群討論分析師，精準萃取中文情緒詞彙。只回覆 JSON。', prompt)
      incrementQuota('gemini_chat')

      const parsed = parseJSON<AnalyzeResult>(answer)
      if (!parsed) {
        errors.push(`${cat}: JSON parse failed`)
        continue
      }
      results[cat] = parsed

      if (cat !== 'LINE GO 總覽' && parsed.sentimentByPostId) {
        for (const [idStr, sent] of Object.entries(parsed.sentimentByPostId)) {
          mergedSentiments[Number(idStr)] = sent
        }
      }
    } catch (err) {
      console.error(`Analyze error ${cat}:`, err)
      errors.push(`${cat}: ${(err as Error).message}`)
    }
  }

  assignSentiments(mergedSentiments)
  saveAnalysis(results)

  return NextResponse.json({
    analysis: results,
    errors: errors.length ? errors : undefined,
    quota: getQuotaStatus('gemini_chat'),
  })
}
