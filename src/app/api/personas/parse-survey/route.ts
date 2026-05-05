import { NextRequest, NextResponse } from 'next/server'
import { chat } from '@/lib/gemini'
import { getQuotaStatus, incrementQuota } from '@/lib/quota'
import type { SurveyQuestion, SurveyQuestionType } from '@/types'

const MAX_INPUT_LENGTH = 12000
const MAX_QUESTIONS = 30

const SYSTEM_PROMPT = `你是問卷解析助手。使用者會貼上一份問卷的原始文字（可能來自 SurveyCake / Google Forms / Typeform / 紙本掃描的 markdown），請把它解析成結構化 JSON。

**只回傳合法 JSON，不可包含 markdown code fence 或其他文字。** 格式：

{
  "questions": [
    {
      "type": "single" | "multi" | "likert" | "open",
      "text": "題目文字（保持原樣，不翻譯不改寫）",
      "options": ["選項 1", "選項 2", ...],
      "scale": { "min": 1, "max": 5, "minLabel": "非常不同意", "maxLabel": "非常同意" }
    }
  ]
}

題型判斷規則：
- **single**：單選題，給定 N 個選項，受訪者選 1 個。需要 \`options\`
- **multi**：複選題，明示「可複選」「最多選 N 項」「請勾選」。需要 \`options\`
- **likert**：量表題，1-5 / 1-7 / 0-10 等數值評分，可能有 minLabel/maxLabel（例「非常不同意 → 非常同意」）。需要 \`scale\`，不需要 \`options\`
- **open**：開放式文字題，沒有選項。只需要 \`text\`

矩陣題（同一量表評多個子項）：請拆成多筆 likert，每個子項獨立成一題，題目文字組合「主題 — 子項」（例：「操作流程容易度 — 地圖搜車」）

注意：
- 問卷說明、致謝、進度條、頁碼、按鈕（下一頁/送出）等非題目內容請忽略
- 引導性說明（「以下是...」「請根據...」）若不是題目本身也忽略
- 最多輸出 ${MAX_QUESTIONS} 題
- 題目順序保持原文順序
- 繁體中文，保留原文用字`

interface ParsedQuestion {
  type?: string
  text?: unknown
  options?: unknown
  scale?: unknown
}

function sanitizeQuestion(raw: ParsedQuestion): SurveyQuestion | null {
  const text = typeof raw.text === 'string' ? raw.text.trim() : ''
  if (!text) return null
  const type = (raw.type ?? '').toString() as SurveyQuestionType
  if (!['single', 'multi', 'likert', 'open'].includes(type)) return null

  const q: SurveyQuestion = { type, text }
  if (type === 'single' || type === 'multi') {
    const opts = Array.isArray(raw.options)
      ? raw.options.map(o => String(o ?? '').trim()).filter(Boolean)
      : []
    if (opts.length < 2) return null
    q.options = opts
  } else if (type === 'likert') {
    const s = (raw.scale ?? {}) as Record<string, unknown>
    const min = Number(s.min ?? 1)
    const max = Number(s.max ?? 5)
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
      q.scale = { min: 1, max: 5 }
    } else {
      q.scale = { min, max }
      if (typeof s.minLabel === 'string') q.scale.minLabel = s.minLabel
      if (typeof s.maxLabel === 'string') q.scale.maxLabel = s.maxLabel
    }
  }
  return q
}

function parseJsonResponse(raw: string): SurveyQuestion[] {
  const cleaned = raw.replace(/^```json\s*|\s*```$/g, '').replace(/^```\s*|\s*```$/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end < 0) throw new Error('AI 回傳非 JSON')
  const json = JSON.parse(cleaned.slice(start, end + 1))
  if (!Array.isArray(json.questions)) throw new Error('AI 回傳缺少 questions 陣列')
  const questions: SurveyQuestion[] = []
  for (const raw of json.questions.slice(0, MAX_QUESTIONS)) {
    const q = sanitizeQuestion(raw)
    if (q) questions.push(q)
  }
  if (questions.length === 0) throw new Error('解析後沒有有效題目')
  return questions
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const rawText = String(body.rawText ?? '').trim()

  if (!rawText) {
    return NextResponse.json({ error: '需要 rawText' }, { status: 400 })
  }
  if (rawText.length > MAX_INPUT_LENGTH) {
    return NextResponse.json(
      { error: `內容過長：${rawText.length} 字（上限 ${MAX_INPUT_LENGTH}）` },
      { status: 400 },
    )
  }

  const quota = getQuotaStatus('gemini_chat')
  if (quota.remaining <= 0) {
    return NextResponse.json(
      { error: `今日 AI 額度已用完 (${quota.used}/${quota.limit})`, quota },
      { status: 429 },
    )
  }

  try {
    const reply = await chat(SYSTEM_PROMPT, `請解析下列問卷：\n\n${rawText}\n\n只回 JSON。`)
    incrementQuota('gemini_chat')
    const questions = parseJsonResponse(reply)
    return NextResponse.json({
      questions,
      quota: getQuotaStatus('gemini_chat'),
    })
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message, quota: getQuotaStatus('gemini_chat') },
      { status: 500 },
    )
  }
}
