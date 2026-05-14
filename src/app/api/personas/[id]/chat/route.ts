import { NextRequest, NextResponse } from 'next/server'
import { getPersona } from '@/lib/persona-store'
import { getMessages, appendMessage, clearMessages } from '@/lib/persona-chat-store'
import { chatWithHistory, type ChatImagePart } from '@/lib/gemini'
import { getQuotaStatus, checkQuota, incrementQuota, quotaDeniedMessage } from '@/lib/quota'
import {
  saveChatImage,
  isAllowedImageMime,
  MAX_IMAGE_BYTES,
  MAX_IMAGES_PER_MESSAGE,
  ImageValidationError,
} from '@/lib/chat-image-store'
import { semanticSearch } from '@/lib/rag/local-semantic-retriever'

const QUOTE_RETRIEVE_TOP_K = 3
const QUOTE_RETRIEVE_MIN_SCORE = 0.3
const QUOTE_RETRIEVE_MIN_QUERY_LEN = 3

async function retrievePersonaQuotes(
  personaId: number,
  query: string,
): Promise<string[]> {
  if (!query || query.length < QUOTE_RETRIEVE_MIN_QUERY_LEN) return []
  if (!checkQuota('gemini_embedding').ok) return []
  try {
    const hits = await semanticSearch(query, {
      topK: QUOTE_RETRIEVE_TOP_K,
      filter: { source_type: 'persona_quote', source_id: personaId },
    })
    return hits
      .filter(h => h.score >= QUOTE_RETRIEVE_MIN_SCORE)
      .map(h => h.text)
  } catch (err) {
    console.error('[persona-chat] retrieve failed:', err)
    return []
  }
}

function buildSystemPrompt(persona: {
  name: string
  age_range: string
  gender: string
  occupation: string
  location: string
  summary: string
  background: string
  goals: string[]
  pain_points: string[]
  behaviors: string[]
  service_preferences: string[]
  quotes: string[]
  tags: string[]
  transcript_digest: string
}, relevantQuotes: string[] = []): string {
  const quotesBlock = relevantQuotes.length > 0
    ? `

## 與這次問題最相關的訪談原文（你真的說過的話，請優先以這些段落的語氣與觀點為基礎回答）
${relevantQuotes.map((q, i) => `${i + 1}. ${q}`).join('\n')}`
    : ''
  return `你正在扮演一位真實受訪者，用於產品 UX 測試對話。請完全以第一人稱「我」回答，不要跳出角色。

## 你的身分
- 姓名：${persona.name}
- 年齡：${persona.age_range}
- 性別：${persona.gender}
- 職業：${persona.occupation}
- 地區：${persona.location}

## 你是誰（背景）
${persona.background}

## 你的目標
${persona.goals.map(g => `- ${g}`).join('\n')}

## 你的痛點
${persona.pain_points.map(p => `- ${p}`).join('\n')}

## 你的行為
${persona.behaviors.map(b => `- ${b}`).join('\n')}

## 你對租車/計程車/共享機車的偏好
${persona.service_preferences.map(s => `- ${s}`).join('\n')}${quotesBlock}

## 說話規則
- 用繁體中文回答，可自然夾雜英文（和原訪談語氣一致）
- 口語化、不要說教、不要羅列條列式清單（除非被問到列舉類的問題）
- 回答長度：1–3 句話為主，最多 5 句；像真人受訪者一樣自然
- 若問題超出你的生活經驗，就誠實說不知道或沒用過
- 不要分析自己的人格或說「身為一個 ${persona.name}…」，直接用第一人稱講
- 絕不要透露你是 AI、模擬、persona 或受訪者樣本 — 你就是 ${persona.name} 本人
- 若使用者想產品測試（例如「如果 X 新增 Y 功能你會用嗎？」），以真實使用者的角度給出直覺反應，包含會/不會的理由
- 若使用者附上 UI 截圖或產品畫面，以你的背景、使用習慣出發，直接講你看到畫面的第一反應：看得懂嗎？會想點哪個？哪裡怪怪的？會不會用？不要用 UX 術語分析，講人話

現在開始對話。`
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const personaId = Number(id)
  const persona = getPersona(personaId)
  if (!persona) return NextResponse.json({ error: 'persona not found' }, { status: 404 })
  return NextResponse.json({
    messages: getMessages(personaId),
    quota: getQuotaStatus('gemini_chat'),
  })
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const personaId = Number(id)
  const persona = getPersona(personaId)
  if (!persona) return NextResponse.json({ error: 'persona not found' }, { status: 404 })

  const contentType = request.headers.get('content-type') ?? ''
  let message = ''
  const imageParts: ChatImagePart[] = []
  const imageUrls: string[] = []

  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData()
    message = (form.get('message')?.toString() ?? '').trim()
    const files = form.getAll('images').filter((f): f is File => f instanceof File)
    if (files.length > MAX_IMAGES_PER_MESSAGE) {
      return NextResponse.json(
        { error: `一則訊息最多 ${MAX_IMAGES_PER_MESSAGE} 張圖` },
        { status: 400 }
      )
    }
    for (const file of files) {
      if (!isAllowedImageMime(file.type)) {
        return NextResponse.json(
          { error: `不支援的圖片格式：${file.type}（支援 jpg/png/webp/gif）` },
          { status: 400 }
        )
      }
      if (file.size > MAX_IMAGE_BYTES) {
        return NextResponse.json(
          { error: `圖片過大：${file.name}（上限 5 MB）` },
          { status: 400 }
        )
      }
      const buffer = Buffer.from(await file.arrayBuffer())
      try {
        const saved = saveChatImage(buffer, file.type)
        imageUrls.push(saved.url)
        imageParts.push({ data: buffer.toString('base64'), mimeType: saved.mime })
      } catch (err) {
        if (err instanceof ImageValidationError) {
          return NextResponse.json({ error: err.message }, { status: 400 })
        }
        throw err
      }
    }
  } else {
    const body = await request.json().catch(() => ({ message: '' }))
    message = typeof body.message === 'string' ? body.message.trim() : ''
  }

  if (!message && imageParts.length === 0) {
    return NextResponse.json({ error: '訊息或圖片至少擇一' }, { status: 400 })
  }

  const q = checkQuota('gemini_chat')
  if (!q.ok) {
    return NextResponse.json(
      {
        error: quotaDeniedMessage('gemini_chat', q.used, q.limit),
        quota: getQuotaStatus('gemini_chat'),
      },
      { status: 429 },
    )
  }

  const prior = getMessages(personaId)
  const userMsg = appendMessage(personaId, 'user', message, imageUrls)

  try {
    const relevantQuotes = await retrievePersonaQuotes(personaId, message)
    const systemPrompt = buildSystemPrompt(persona, relevantQuotes)
    const history = prior.map(m => ({ role: m.role, content: m.content }))
    const promptText = message || '（使用者沒有附文字，只附了畫面。請直接針對圖片給第一印象與反應）'
    const reply = await chatWithHistory(systemPrompt, history, promptText, imageParts)
    incrementQuota('gemini_chat')
    const assistantMsg = appendMessage(personaId, 'assistant', reply)
    return NextResponse.json({
      user: userMsg,
      assistant: assistantMsg,
      quota: getQuotaStatus('gemini_chat'),
    })
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message, user: userMsg },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const personaId = Number(id)
  clearMessages(personaId)
  return NextResponse.json({ ok: true })
}
