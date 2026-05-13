import { NextRequest, NextResponse } from 'next/server'
import { isLocalMode } from '@/lib/local-mode'
import { chatLite } from '@/lib/gemini'
import { getQuotaStatus, incrementQuota } from '@/lib/quota'
import { getServiceLabel } from '@/lib/service-labels'

interface Recommendation {
  id: number
  reason: string
}

const SYSTEM_PROMPT = `你是研究報告圖書館員，使用者描述需求後，請從候選報告中挑出 3~5 份最相關的，並用一句話說明為何推薦。

必須輸出合法 JSON，不可包含 markdown 或其他文字，格式：

{
  "recommendations": [
    { "id": 123, "reason": "為何推薦（30 字內）" }
  ]
}

規則：
- id 必須是候選清單中出現過的數字
- 最多 5 份，依相關度由高到低排序；若真的沒有合適的，給空陣列
- reason 聚焦在「這份報告解決使用者問題的哪個面向」
- 繁體中文，可自然夾雜英文`

function parseRecommendJson(raw: string): Recommendation[] {
  const cleaned = raw.replace(/^```json\s*|\s*```$/g, '').replace(/^```\s*|\s*```$/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end < 0) throw new Error('AI 回傳非 JSON')
  const obj = JSON.parse(cleaned.slice(start, end + 1))
  if (!Array.isArray(obj.recommendations)) throw new Error('AI 回傳缺少 recommendations')
  return obj.recommendations
    .filter((r: unknown) => {
      const rec = r as Recommendation
      return typeof rec?.id === 'number' && typeof rec?.reason === 'string'
    })
    .slice(0, 5)
}

export async function POST(request: NextRequest) {
  if (!isLocalMode()) {
    return NextResponse.json({ error: 'Not implemented for remote mode' }, { status: 501 })
  }

  const body = await request.json().catch(() => ({}))
  const query = String(body.query ?? '').trim()
  if (!query) {
    return NextResponse.json({ error: '請輸入要查找的主題或問題' }, { status: 400 })
  }

  const quota = getQuotaStatus('gemini_chat')
  if (quota.remaining <= 0) {
    return NextResponse.json(
      { error: `今日 AI 額度已用完 (${quota.used}/${quota.limit})`, quota },
      { status: 429 },
    )
  }

  const { getLocalDocuments } = await import('@/lib/local-store')
  const reports = getLocalDocuments('report')
  if (reports.length === 0) {
    return NextResponse.json({ error: '尚無報告可供推薦' }, { status: 400 })
  }

  const catalog = reports.map(doc => {
    const meta = (doc.metadata ?? {}) as Record<string, unknown>
    return {
      id: doc.id,
      title: doc.title,
      category: meta.category ?? '未分類',
      tags: Array.isArray(meta.tags) ? meta.tags : [],
      summary: meta.summary ?? '',
    }
  })

  const catalogText = catalog
    .map(c => `- id=${c.id} | 分類：${getServiceLabel(c.category as string)} | 標籤：${(c.tags as string[]).join('、') || '無'} | ${c.title}${c.summary ? `\n  摘要：${c.summary}` : ''}`)
    .join('\n')

  const userPrompt = `使用者需求：${query}

候選報告（共 ${catalog.length} 份）：
${catalogText}

請輸出 JSON 推薦：`

  try {
    const raw = await chatLite(SYSTEM_PROMPT, userPrompt)
    incrementQuota('gemini_chat')
    const recs = parseRecommendJson(raw)
    const validIds = new Set(reports.map(r => r.id))
    const enriched = recs
      .filter(r => validIds.has(r.id))
      .map(r => {
        const doc = reports.find(d => d.id === r.id)!
        const meta = (doc.metadata ?? {}) as Record<string, unknown>
        return {
          id: doc.id,
          title: doc.title,
          category: meta.category ?? '未分類',
          tags: Array.isArray(meta.tags) ? meta.tags : [],
          summary: meta.summary ?? '',
          reason: r.reason,
        }
      })
    return NextResponse.json({
      query,
      recommendations: enriched,
      quota: getQuotaStatus('gemini_chat'),
    })
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message, quota: getQuotaStatus('gemini_chat') },
      { status: 500 },
    )
  }
}
