import { NextRequest, NextResponse } from 'next/server'
import { chat } from '@/lib/gemini'
import { checkQuota, incrementQuota } from '@/lib/quota'
import { isLocalMode } from '@/lib/local-mode'
import {
  getMetrics,
  loadMonthRawRows,
  updateThemes,
} from '@/lib/monthly-survey-store'
import type { SurveyTheme } from '@/types'

export const runtime = 'nodejs'

const SYSTEM_PROMPT = `你是用戶回饋分析師。任務：把使用者填寫的回饋文字分群成主題。

規則：
- 每個主題給一個簡短中文 label（≤12 字），例如「車內清潔差」、「優惠券不足」
- 列出該主題出現次數，count 必須是整數
- 提供 2-3 個代表性原文（保留原始文字，不要改寫）
- 主題數量建議 3-7 個；類似的請合併
- 若資料筆數少於 3，可以一條一個主題

回傳純 JSON（無 markdown 包裝）：
{
  "themes": [
    { "label": string, "count": number, "examples": string[] }
  ]
}`

async function classifyTexts(label: string, texts: string[]): Promise<SurveyTheme[]> {
  if (texts.length === 0) return []
  const userMsg = `${label}（共 ${texts.length} 條）：\n${texts
    .map((t, i) => `${i + 1}. ${t}`)
    .join('\n')}`
  const raw = await chat(SYSTEM_PROMPT, userMsg)
  const cleaned = raw.replace(/```json\s*|```/g, '').trim()
  try {
    const json = JSON.parse(cleaned) as { themes?: unknown }
    if (!Array.isArray(json.themes)) return []
    return json.themes
      .map(t => {
        const obj = t as Record<string, unknown>
        return {
          label: typeof obj.label === 'string' ? obj.label : '',
          count: typeof obj.count === 'number' ? obj.count : 0,
          examples: Array.isArray(obj.examples)
            ? (obj.examples as unknown[]).map(String).slice(0, 3)
            : [],
        }
      })
      .filter(t => t.label.length > 0)
      .sort((a, b) => b.count - a.count)
  } catch {
    return []
  }
}

export async function POST(req: NextRequest) {
  if (!isLocalMode()) {
    return NextResponse.json({ error: 'production not implemented' }, { status: 501 })
  }
  const body = (await req.json().catch(() => ({}))) as { month?: string; service?: string }
  if (!body.month || !body.service) {
    return NextResponse.json({ error: 'month + service required' }, { status: 400 })
  }
  const { month, service } = body

  if (!getMetrics(month, service)) {
    return NextResponse.json({ error: 'metrics not found' }, { status: 404 })
  }

  const rawRows = loadMonthRawRows(month).filter(r => r.service === service)
  const suggestions: string[] = []
  const complaints: string[] = []
  for (const r of rawRows) {
    for (const s of r.other_suggestion) if (s.trim()) suggestions.push(s.trim())
    for (const c of r.other_complaints) if (c.trim()) complaints.push(c.trim())
  }

  const calls = (suggestions.length > 0 ? 1 : 0) + (complaints.length > 0 ? 1 : 0)
  if (calls === 0) {
    const themes = { suggestion: [], complaint: [] }
    updateThemes(month, service, themes)
    return NextResponse.json({ themes, themes_updated_at: new Date().toISOString(), note: 'no free-text feedback' })
  }

  const q = checkQuota('gemini_chat')
  if (q.used + calls > q.limit) {
    return NextResponse.json(
      { error: 'quota exceeded', used: q.used, limit: q.limit },
      { status: 429 },
    )
  }

  const themes: { suggestion?: SurveyTheme[]; complaint?: SurveyTheme[] } = {}
  if (suggestions.length > 0) {
    themes.suggestion = await classifyTexts('正面建議自填', suggestions)
    incrementQuota('gemini_chat')
  }
  if (complaints.length > 0) {
    themes.complaint = await classifyTexts('負面回饋自填', complaints)
    incrementQuota('gemini_chat')
  }

  updateThemes(month, service, themes)
  return NextResponse.json({
    themes,
    themes_updated_at: new Date().toISOString(),
    counts: { suggestions: suggestions.length, complaints: complaints.length },
  })
}
