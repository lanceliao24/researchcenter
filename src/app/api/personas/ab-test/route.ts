import { NextRequest, NextResponse } from 'next/server'
import { getPersona } from '@/lib/persona-store'
import { generateMultimodal, type MultimodalPart } from '@/lib/gemini'
import {
  getQuotaStatus,
  checkQuota,
  incrementQuota,
  quotaDeniedMessage,
} from '@/lib/quota'
import { semanticSearch } from '@/lib/rag/local-semantic-retriever'
import {
  saveChatImage,
  isAllowedImageMime,
  MAX_IMAGE_BYTES,
  MAX_IMAGES_PER_MESSAGE,
  ImageValidationError,
} from '@/lib/chat-image-store'
import { scoreUsageIntent } from '@/lib/semantic-likert'
import type {
  ABTestOptionAssessment,
  ABTestResponse,
  ABTestSummary,
  ABTestWinner,
  Persona,
} from '@/types'

const TIE_THRESHOLD = 0.3
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
    return hits.filter(h => h.score >= QUOTE_RETRIEVE_MIN_SCORE).map(h => h.text)
  } catch (err) {
    console.error('[ab-test] retrieve failed:', err)
    return []
  }
}

interface PreparedOption {
  label: 'A' | 'B'
  title: string
  description: string
  imageUrls: string[]
  parts: MultimodalPart[]
}

function buildSystemPrompt(persona: Persona, relevantQuotes: string[] = []): string {
  const quotesBlock = relevantQuotes.length > 0
    ? `

## 與這個方案最相關的訪談原文（你真的說過的話，請優先以這些段落的語氣與觀點為基礎反應）
${relevantQuotes.map((q, i) => `${i + 1}. ${q}`).join('\n')}`
    : ''
  return `你正在扮演一位真實受訪者 ${persona.name}。研究員在做產品方案測試，會給你一個方案（含描述與/或畫面），請用第一人稱、口語、像真人訪談那樣，講你看完後的真實反應。

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

## 回答規則
- 只回答「你對這個方案的真實反應」：會不會用？為什麼會/不會？有沒有擔心的點？
- 2–4 句話，自然口語，不要條列、不要 JSON、不要分析自己
- 用繁體中文，可以自然夾雜英文（和原訪談語氣一致）
- 不要說「身為 ${persona.name}…」這種第三人稱分析
- 絕不要透露你是 AI、模擬、persona`
}

async function parseImagesFromForm(
  form: FormData,
  field: 'imagesA' | 'imagesB'
): Promise<{ parts: MultimodalPart[]; urls: string[] } | { error: string }> {
  const files = form.getAll(field).filter((f): f is File => f instanceof File)
  if (files.length > MAX_IMAGES_PER_MESSAGE) {
    return { error: `方案 ${field === 'imagesA' ? 'A' : 'B'} 最多 ${MAX_IMAGES_PER_MESSAGE} 張圖` }
  }
  const parts: MultimodalPart[] = []
  const urls: string[] = []
  for (const file of files) {
    if (!isAllowedImageMime(file.type)) {
      return { error: `不支援的圖片格式：${file.type}（支援 jpg/png/webp/gif）` }
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return { error: `圖片過大：${file.name}（上限 5 MB）` }
    }
    const buffer = Buffer.from(await file.arrayBuffer())
    try {
      const saved = saveChatImage(buffer, file.type)
      urls.push(saved.url)
      parts.push({ inlineData: { data: buffer.toString('base64'), mimeType: saved.mime } })
    } catch (err) {
      if (err instanceof ImageValidationError) return { error: err.message }
      throw err
    }
  }
  return { parts, urls }
}

function buildOptionParts(option: PreparedOption): MultimodalPart[] {
  const parts: MultimodalPart[] = []
  parts.push({
    text: `研究員提出的方案：${option.title || '(未命名方案)'}\n\n${option.description || '(沒有文字描述，請只看畫面)'}`,
  })
  parts.push(...option.parts)
  parts.push({
    text: '請用第一人稱、口語、2–4 句話講你的真實反應：會不會用？為什麼？',
  })
  return parts
}

async function assessOption(
  persona: Persona,
  option: PreparedOption,
  relevantQuotes: string[],
): Promise<ABTestOptionAssessment> {
  const systemPrompt = buildSystemPrompt(persona, relevantQuotes)
  const userParts = buildOptionParts(option)
  const reaction = (await generateMultimodal(systemPrompt, userParts)).trim()
  const result = await scoreUsageIntent(reaction)
  return {
    reaction,
    likert: result.likert,
    score: result.score,
    similarities: result.similarities,
  }
}

function decideWinner(scoreA: number, scoreB: number): ABTestWinner {
  const diff = scoreA - scoreB
  if (Math.abs(diff) < TIE_THRESHOLD) return 'tie'
  return diff > 0 ? 'A' : 'B'
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json({ error: '需要 multipart/form-data' }, { status: 400 })
  }

  const form = await request.formData()
  const personaIds: number[] = (form.get('personaIds')?.toString() ?? '')
    .split(',')
    .map(s => Number(s.trim()))
    .filter(n => Number.isFinite(n) && n > 0)

  if (personaIds.length === 0) {
    return NextResponse.json({ error: '至少需要 1 位 persona' }, { status: 400 })
  }
  if (personaIds.length > 10) {
    return NextResponse.json({ error: '單次 A/B test 最多 10 位 persona' }, { status: 400 })
  }

  const titleA = (form.get('titleA')?.toString() ?? '').trim()
  const titleB = (form.get('titleB')?.toString() ?? '').trim()
  const descriptionA = (form.get('descriptionA')?.toString() ?? '').trim()
  const descriptionB = (form.get('descriptionB')?.toString() ?? '').trim()

  const imgA = await parseImagesFromForm(form, 'imagesA')
  if ('error' in imgA) return NextResponse.json({ error: imgA.error }, { status: 400 })
  const imgB = await parseImagesFromForm(form, 'imagesB')
  if ('error' in imgB) return NextResponse.json({ error: imgB.error }, { status: 400 })

  const hasContentA = descriptionA || imgA.parts.length > 0
  const hasContentB = descriptionB || imgB.parts.length > 0
  if (!hasContentA || !hasContentB) {
    return NextResponse.json(
      { error: '方案 A 和 B 都至少需要描述或一張圖' },
      { status: 400 }
    )
  }

  const personas: Persona[] = []
  for (const id of personaIds) {
    const p = getPersona(id)
    if (!p) return NextResponse.json({ error: `persona ${id} not found` }, { status: 404 })
    personas.push(p)
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

  const optionA: PreparedOption = {
    label: 'A',
    title: titleA,
    description: descriptionA,
    imageUrls: imgA.urls,
    parts: imgA.parts,
  }
  const optionB: PreparedOption = {
    label: 'B',
    title: titleB,
    description: descriptionB,
    imageUrls: imgB.urls,
    parts: imgB.parts,
  }

  const optionAQuery = `${optionA.title}\n${optionA.description}`.trim()
  const optionBQuery = `${optionB.title}\n${optionB.description}`.trim()

  const responses: ABTestResponse[] = await Promise.all(
    personas.map(async (persona) => {
      const [quotesA, quotesB] = await Promise.all([
        retrievePersonaQuotes(persona.id, optionAQuery),
        retrievePersonaQuotes(persona.id, optionBQuery),
      ])
      const [resA, resB] = await Promise.allSettled([
        assessOption(persona, optionA, quotesA),
        assessOption(persona, optionB, quotesB),
      ])
      if (resA.status === 'fulfilled') incrementQuota('gemini_chat')
      if (resB.status === 'fulfilled') incrementQuota('gemini_chat')
      if (resA.status !== 'fulfilled' || resB.status !== 'fulfilled') {
        const failed = resA.status === 'rejected' ? resA.reason : (resB as PromiseRejectedResult).reason
        return {
          personaId: persona.id,
          personaName: persona.name,
          error: (failed as Error).message,
        }
      }
      const assessmentA = resA.value
      const assessmentB = resB.value
      return {
        personaId: persona.id,
        personaName: persona.name,
        A: assessmentA,
        B: assessmentB,
        diff: assessmentA.score - assessmentB.score,
        winner: decideWinner(assessmentA.score, assessmentB.score),
      }
    })
  )

  const valid = responses.filter(r => r.A && r.B)
  const total = valid.length
  const meanA = total === 0 ? 0 : valid.reduce((s, r) => s + (r.A?.score ?? 0), 0) / total
  const meanB = total === 0 ? 0 : valid.reduce((s, r) => s + (r.B?.score ?? 0), 0) / total
  const summary: ABTestSummary = {
    meanA,
    meanB,
    meanDiff: meanA - meanB,
    winnerCount: {
      A: valid.filter(r => r.winner === 'A').length,
      B: valid.filter(r => r.winner === 'B').length,
      tie: valid.filter(r => r.winner === 'tie').length,
    },
    total,
  }

  return NextResponse.json({
    responses,
    summary,
    options: {
      A: { title: titleA, description: descriptionA, imageUrls: imgA.urls },
      B: { title: titleB, description: descriptionB, imageUrls: imgB.urls },
    },
    quota: getQuotaStatus('gemini_chat'),
  })
}
