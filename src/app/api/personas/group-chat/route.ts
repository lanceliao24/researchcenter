import { NextRequest, NextResponse } from 'next/server'
import { getPersona } from '@/lib/persona-store'
import { chat, generateMultimodal, type MultimodalPart } from '@/lib/gemini'
import {
  getQuotaStatus,
  getUserQuotaStatus,
  checkBoth,
  incrementBoth,
  checkUserQuota,
  quotaDeniedMessage,
} from '@/lib/quota'
import { requireUser, type Role } from '@/lib/auth'
import { semanticSearch } from '@/lib/rag/local-semantic-retriever'

const QUOTE_RETRIEVE_TOP_K = 3
const QUOTE_RETRIEVE_MIN_SCORE = 0.3
const QUOTE_RETRIEVE_MIN_QUERY_LEN = 3

async function retrievePersonaQuotes(
  personaId: number,
  query: string,
  email: string,
  role: Role,
): Promise<string[]> {
  if (!query || query.length < QUOTE_RETRIEVE_MIN_QUERY_LEN) return []
  if (!checkUserQuota(email, role, 'gemini_embedding').ok) return []
  try {
    const hits = await semanticSearch(query, {
      topK: QUOTE_RETRIEVE_TOP_K,
      filter: { source_type: 'persona_quote', source_id: personaId },
    })
    return hits.filter(h => h.score >= QUOTE_RETRIEVE_MIN_SCORE).map(h => h.text)
  } catch (err) {
    console.error('[group-chat] retrieve failed:', err)
    return []
  }
}
import {
  getGroupMessages,
  appendGroupMessages,
  clearGroupMessages,
  type GroupMessage,
} from '@/lib/persona-group-chat-store'
import {
  saveChatImage,
  isAllowedImageMime,
  MAX_IMAGE_BYTES,
  MAX_IMAGES_PER_MESSAGE,
  ImageValidationError,
} from '@/lib/chat-image-store'
import type { Persona } from '@/types'

function parseIdsParam(value: string | null): number[] {
  if (!value) return []
  return value
    .split(',')
    .map(s => Number(s.trim()))
    .filter(n => Number.isFinite(n) && n > 0)
}

function buildGroupSystemPrompt(self: Persona, others: Persona[], relevantQuotes: string[] = []): string {
  const peers = others
    .map(p => `- ${p.name}（${p.age_range}、${p.gender}、${p.occupation}、${p.location}）`)
    .join('\n')

  const quotesBlock = relevantQuotes.length > 0
    ? `

## 與這次問題最相關的訪談原文（你真的說過的話，請優先以這些段落的語氣與觀點為基礎回答）
${relevantQuotes.map((q, i) => `${i + 1}. ${q}`).join('\n')}`
    : ''

  return `你正在扮演一位真實受訪者，用於產品 UX 焦點團體訪談。請完全以第一人稱「我」回答，不要跳出角色。

## 你的身分
- 姓名：${self.name}
- 年齡：${self.age_range}
- 性別：${self.gender}
- 職業：${self.occupation}
- 地區：${self.location}

## 你是誰（背景）
${self.background}

## 你的目標
${self.goals.map(g => `- ${g}`).join('\n')}

## 你的痛點
${self.pain_points.map(p => `- ${p}`).join('\n')}

## 你的行為
${self.behaviors.map(b => `- ${b}`).join('\n')}

## 你對租車/計程車/共享機車的偏好
${self.service_preferences.map(s => `- ${s}`).join('\n')}${quotesBlock}

## 訪談現場
這是一場焦點團體訪談，除了你之外還有其他受訪者在場：
${peers}

## 說話規則
- 用繁體中文回答，可自然夾雜英文（和原訪談語氣一致）
- 口語化、不要說教、不要羅列條列式清單
- 回答長度：1–3 句話為主，最多 5 句
- 若其他人已經提過的觀點你同意，可以附和但用自己的話加一點個人經驗；若不同意，直接說出你的立場與理由
- 不要重複別人已經說過的具體例子，除非你真的有類似經驗可以呼應
- 若問題超出你的生活經驗，就誠實說不知道或沒用過
- 不要分析自己的人格，直接用第一人稱講
- 絕不要透露你是 AI、模擬、persona — 你就是 ${self.name} 本人
- 只回答你自己的話，不要幫其他人代答、也不要在回答中加上你的名字前綴
- 若主持人附上 UI 截圖或產品畫面，以你的背景、使用習慣出發，直接講你看到畫面的第一反應：看得懂嗎？會想點哪個？哪裡怪怪的？會不會用？不要用 UX 術語分析，講人話`
}

function formatTranscript(
  history: GroupMessage[],
  currentTurnReplies: GroupMessage[],
  currentUserMessage: string,
  selfName: string,
  hasImages: boolean,
): string {
  const lines: string[] = []
  lines.push('[以下是焦點團體訪談至今的對話紀錄]')
  lines.push('')

  for (const m of history) {
    if (m.type === 'user') {
      const imgTag = m.images && m.images.length > 0 ? `（附 ${m.images.length} 張圖）` : ''
      lines.push(`[主持人]${imgTag} ${m.content}`)
    } else {
      lines.push(`[${m.personaName ?? '受訪者'}] ${m.content}`)
    }
  }

  lines.push('')
  const currentImgTag = hasImages ? '（附圖見下方）' : ''
  lines.push(`[主持人]${currentImgTag} ${currentUserMessage}`)

  if (currentTurnReplies.length > 0) {
    for (const r of currentTurnReplies) {
      lines.push(`[${r.personaName ?? '受訪者'}] ${r.content}`)
    }
    lines.push('')
    lines.push(`現在輪到你（${selfName}）回答主持人本題。可以呼應或反對前面受訪者的觀點，但不要重複他們的論點或例子。`)
  } else {
    lines.push('')
    lines.push(`現在輪到你（${selfName}）回答主持人本題。`)
  }

  return lines.join('\n')
}

export async function GET(request: NextRequest) {
  const ids = parseIdsParam(request.nextUrl.searchParams.get('ids'))
  if (ids.length < 2) {
    return NextResponse.json({ messages: [], quota: getQuotaStatus('gemini_chat') })
  }
  return NextResponse.json({
    messages: getGroupMessages(ids),
    quota: getQuotaStatus('gemini_chat'),
  })
}

export async function DELETE(request: NextRequest) {
  const ids = parseIdsParam(request.nextUrl.searchParams.get('ids'))
  if (ids.length < 2) {
    return NextResponse.json({ error: 'ids required' }, { status: 400 })
  }
  clearGroupMessages(ids)
  return NextResponse.json({ ok: true })
}

export async function POST(request: NextRequest) {
  const auth = await requireUser(request)
  if (auth instanceof NextResponse) return auth

  const contentType = request.headers.get('content-type') ?? ''

  let personaIds: number[] = []
  let message = ''
  const inlineImageParts: { data: string; mimeType: string }[] = []
  const imageUrls: string[] = []

  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData()
    const idsRaw = form.get('personaIds')?.toString() ?? ''
    personaIds = parseIdsParam(idsRaw)
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
        inlineImageParts.push({ data: buffer.toString('base64'), mimeType: saved.mime })
      } catch (err) {
        if (err instanceof ImageValidationError) {
          return NextResponse.json({ error: err.message }, { status: 400 })
        }
        throw err
      }
    }
  } else {
    const body = await request.json().catch(() => ({}))
    personaIds = Array.isArray(body.personaIds) ? body.personaIds.map(Number) : []
    message = typeof body.message === 'string' ? body.message.trim() : ''
  }

  if (personaIds.length < 2) {
    return NextResponse.json({ error: '至少需要 2 位 persona 才能進行群組訪談' }, { status: 400 })
  }
  if (personaIds.length > 6) {
    return NextResponse.json({ error: '單次群組訪談最多 6 位 persona' }, { status: 400 })
  }
  if (!message && inlineImageParts.length === 0) {
    return NextResponse.json({ error: '訊息或圖片至少擇一' }, { status: 400 })
  }

  const personas: Persona[] = []
  for (const id of personaIds) {
    const p = getPersona(id)
    if (!p) {
      return NextResponse.json({ error: `persona ${id} not found` }, { status: 404 })
    }
    personas.push(p)
  }

  const q = checkBoth(auth, 'gemini_chat')
  if (!q.ok) {
    return NextResponse.json(
      {
        error: quotaDeniedMessage(q.reason),
        quota: getQuotaStatus('gemini_chat'),
        userQuota: getUserQuotaStatus(auth.email, auth.role, 'gemini_chat'),
      },
      { status: 429 },
    )
  }

  const priorHistory = getGroupMessages(personaIds)
  const userMsg: GroupMessage = {
    type: 'user',
    content: message,
    images: imageUrls.length > 0 ? imageUrls : undefined,
    created_at: new Date().toISOString(),
  }

  const replies: GroupMessage[] = []
  const errors: { personaId: number; personaName: string; error: string }[] = []
  const promptForPersona = message || '（主持人沒有附文字，只附了畫面。請直接針對圖片給第一印象與反應）'
  const hasImages = inlineImageParts.length > 0

  for (const self of personas) {
    const others = personas.filter(p => p.id !== self.id)
    const relevantQuotes = await retrievePersonaQuotes(
      self.id,
      promptForPersona,
      auth.email,
      auth.role,
    )
    const systemPrompt = buildGroupSystemPrompt(self, others, relevantQuotes)
    const userPrompt = formatTranscript(priorHistory, replies, promptForPersona, self.name, hasImages)

    try {
      let reply: string
      if (hasImages) {
        const parts: MultimodalPart[] = [
          ...inlineImageParts.map(img => ({ inlineData: { data: img.data, mimeType: img.mimeType } })),
          { text: userPrompt },
        ]
        reply = await generateMultimodal(systemPrompt, parts)
      } else {
        reply = await chat(systemPrompt, userPrompt)
      }
      incrementBoth(auth, 'gemini_chat')
      replies.push({
        type: 'persona',
        personaId: self.id,
        personaName: self.name,
        content: reply.trim(),
        created_at: new Date().toISOString(),
      })
    } catch (err) {
      errors.push({
        personaId: self.id,
        personaName: self.name,
        error: (err as Error).message,
      })
    }
  }

  appendGroupMessages(personaIds, [userMsg, ...replies])

  return NextResponse.json({
    user: userMsg,
    replies,
    errors,
    quota: getQuotaStatus('gemini_chat'),
  })
}
