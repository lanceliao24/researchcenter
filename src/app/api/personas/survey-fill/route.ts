import { NextRequest, NextResponse } from 'next/server'
import Papa from 'papaparse'
import { isLocalMode } from '@/lib/local-mode'
import { getPersona } from '@/lib/persona-store'
import { chat } from '@/lib/gemini'
import { getQuotaStatus, incrementQuota } from '@/lib/quota'
import { scoreUsageIntent } from '@/lib/semantic-likert'
import { listRuns, saveRun } from '@/lib/persona-survey-fill-store'
import type {
  Persona,
  PersonaSurveyAnswer,
  PersonaSurveyChoiceCount,
  PersonaSurveyFillSource,
  PersonaSurveyQuestionSummary,
  PersonaSurveyResponse,
  SurveyQuestion,
} from '@/types'

const MAX_PERSONAS = 10
const MAX_QUESTIONS = 15

interface SurveyDoc {
  id: number
  title: string
  file_path: string | null
}

async function loadSurveyCsv(docId: number): Promise<{
  doc: SurveyDoc
  headers: string[]
  rows: Record<string, unknown>[]
} | { error: string; status: number }> {
  if (!isLocalMode()) return { error: '目前僅支援本地模式', status: 501 }
  const { getLocalDocuments, readUploadedFile } = await import('@/lib/local-store')
  const docs = getLocalDocuments('survey')
  const doc = docs.find(d => d.id === docId)
  if (!doc) return { error: '找不到 survey', status: 404 }
  if (!doc.file_path) return { error: 'survey 沒有檔案路徑', status: 400 }
  const content = readUploadedFile(doc.file_path)
  const parsed = Papa.parse(content, { header: true, skipEmptyLines: true })
  const headers = (parsed.meta.fields ?? []).filter(Boolean) as string[]
  const rows = (parsed.data as Record<string, unknown>[]).filter(r =>
    headers.some(h => String(r[h] ?? '').trim().length > 0),
  )
  return {
    doc: { id: doc.id, title: doc.title, file_path: doc.file_path },
    headers,
    rows,
  }
}

function summarizeColumns(headers: string[], rows: Record<string, unknown>[]) {
  const SAMPLE_VALUE_COUNT = 3
  const SAMPLE_VALUE_CAP = 60
  return headers.map(h => {
    const values = rows.map(r => String(r[h] ?? '').trim())
    const nonEmpty = values.filter(v => v.length > 0)
    const avgLen = nonEmpty.length === 0
      ? 0
      : nonEmpty.reduce((s, v) => s + v.length, 0) / nonEmpty.length
    const fillRate = rows.length === 0 ? 0 : nonEmpty.length / rows.length
    const samples: string[] = []
    const seen = new Set<string>()
    for (const v of nonEmpty) {
      const trimmed = v.length > SAMPLE_VALUE_CAP ? v.slice(0, SAMPLE_VALUE_CAP) + '…' : v
      if (seen.has(trimmed)) continue
      seen.add(trimmed)
      samples.push(trimmed)
      if (samples.length >= SAMPLE_VALUE_COUNT) break
    }
    return {
      header: h,
      avgLen: Math.round(avgLen * 10) / 10,
      fillRate: Math.round(fillRate * 100) / 100,
      samples,
      isOpenEnded: avgLen >= 15 && fillRate >= 0.1,
    }
  })
}

export async function GET(request: NextRequest) {
  const surveyIdParam = request.nextUrl.searchParams.get('surveyId')
  if (surveyIdParam) {
    const surveyId = Number(surveyIdParam)
    if (!Number.isFinite(surveyId)) {
      return NextResponse.json({ error: 'invalid surveyId' }, { status: 400 })
    }
    const loaded = await loadSurveyCsv(surveyId)
    if ('error' in loaded) {
      return NextResponse.json({ error: loaded.error }, { status: loaded.status })
    }
    return NextResponse.json({
      survey: loaded.doc,
      totalRows: loaded.rows.length,
      columns: summarizeColumns(loaded.headers, loaded.rows),
      runs: listRuns(surveyId),
      quota: getQuotaStatus('gemini_chat'),
    })
  }
  return NextResponse.json({
    runs: listRuns(),
    quota: getQuotaStatus('gemini_chat'),
  })
}

function buildSystemPrompt(persona: Persona, modeNote: string): string {
  return `你正在扮演一位真實受訪者 ${persona.name}，研究員會請你回答問卷題目。${modeNote}

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
${persona.service_preferences.map(s => `- ${s}`).join('\n')}

## 你曾經說過的話（從訪談逐字稿擷取，回答時盡量參考語氣與觀點）
${persona.transcript_digest}

## 共通規則
- 用第一人稱、口語、繁體中文（可自然夾雜英文），不要說「身為 ${persona.name}…」
- 絕不要透露你是 AI / 模擬 / persona`
}

async function answerLikert(persona: Persona, q: SurveyQuestion): Promise<PersonaSurveyAnswer> {
  const sys = buildSystemPrompt(
    persona,
    '請以口語自然語言講出你對這題的真實感受（2–3 句），不要直接給數字。',
  )
  const scaleHint = q.scale
    ? `（量表 ${q.scale.min}–${q.scale.max}${q.scale.minLabel ? `，${q.scale.min}=${q.scale.minLabel}` : ''}${q.scale.maxLabel ? `，${q.scale.max}=${q.scale.maxLabel}` : ''}）`
    : ''
  const userPrompt = `問卷題目：${q.text}${scaleHint}\n\n用 2–3 句講你的真實感受與立場（會不會用、同不同意、滿不滿意等）。`
  const reaction = (await chat(sys, userPrompt)).trim()
  const result = await scoreUsageIntent(reaction)
  return {
    question: q.text,
    type: 'likert',
    reaction,
    likert: result.likert,
    score: result.score,
    similarities: result.similarities,
  }
}

interface ChoiceJson {
  choice?: unknown
  choices?: unknown
  reason?: unknown
}

function extractJson(raw: string): ChoiceJson {
  const cleaned = raw.replace(/^```json\s*|\s*```$/g, '').replace(/^```\s*|\s*```$/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end < 0) throw new Error('AI 回傳非 JSON')
  return JSON.parse(cleaned.slice(start, end + 1))
}

async function answerSingle(persona: Persona, q: SurveyQuestion): Promise<PersonaSurveyAnswer> {
  const sys = buildSystemPrompt(
    persona,
    '這是單選題，請從給定選項挑 1 個，並用 1–2 句話說明為什麼這樣選。回 JSON。',
  )
  const opts = q.options ?? []
  const userPrompt = `問卷題目：${q.text}

選項：
${opts.map((o, i) => `${i + 1}. ${o}`).join('\n')}

只回 JSON：
{"choice": "你選的那個選項的完整文字（必須跟上面其中一個一字不差）", "reason": "1–2 句話說明"}`
  const replyRaw = (await chat(sys, userPrompt)).trim()
  const json = extractJson(replyRaw)
  const choiceText = String(json.choice ?? '').trim()
  const reason = String(json.reason ?? '').trim()
  const matched = opts.find(o => o === choiceText) ?? opts.find(o => o.includes(choiceText) || choiceText.includes(o))
  return {
    question: q.text,
    type: 'single',
    reaction: reason,
    choice: matched ?? choiceText,
  }
}

async function answerMulti(persona: Persona, q: SurveyQuestion): Promise<PersonaSurveyAnswer> {
  const sys = buildSystemPrompt(
    persona,
    '這是複選題，可以選 0 至多個選項，並用 1–2 句說明選擇理由。回 JSON。',
  )
  const opts = q.options ?? []
  const userPrompt = `問卷題目：${q.text}

選項：
${opts.map((o, i) => `${i + 1}. ${o}`).join('\n')}

只回 JSON：
{"choices": ["選項文字 1", "選項文字 2", ...], "reason": "1–2 句話說明"}`
  const replyRaw = (await chat(sys, userPrompt)).trim()
  const json = extractJson(replyRaw)
  const arr = Array.isArray(json.choices) ? json.choices : []
  const reason = String(json.reason ?? '').trim()
  const matched = arr
    .map(c => String(c ?? '').trim())
    .map(c => opts.find(o => o === c) ?? opts.find(o => o.includes(c) || c.includes(o)) ?? c)
    .filter((c, i, self) => c && self.indexOf(c) === i)
  return {
    question: q.text,
    type: 'multi',
    reaction: reason,
    choices: matched,
  }
}

async function answerOpen(persona: Persona, q: SurveyQuestion): Promise<PersonaSurveyAnswer> {
  const sys = buildSystemPrompt(
    persona,
    '這是開放式問題，請用第一人稱、口語、2–4 句回答。',
  )
  const userPrompt = `問卷題目：${q.text}\n\n用 2–4 句講你的真實答案與想法。`
  const reaction = (await chat(sys, userPrompt)).trim()
  return {
    question: q.text,
    type: 'open',
    reaction,
  }
}

async function answerQuestion(persona: Persona, q: SurveyQuestion): Promise<PersonaSurveyAnswer> {
  switch (q.type) {
    case 'single':
      return answerSingle(persona, q)
    case 'multi':
      return answerMulti(persona, q)
    case 'likert':
      return answerLikert(persona, q)
    case 'open':
      return answerOpen(persona, q)
  }
}

function summarizeQuestion(
  q: SurveyQuestion,
  responses: PersonaSurveyResponse[],
): PersonaSurveyQuestionSummary {
  const answers = responses
    .map(r => r.answers.find(a => a.question === q.text))
    .filter((a): a is PersonaSurveyAnswer => !!a)
  const summary: PersonaSurveyQuestionSummary = {
    question: q.text,
    type: q.type,
    responseCount: answers.length,
  }
  if (q.type === 'likert') {
    const scores: number[] = []
    const likerts: number[] = []
    for (const a of answers) {
      if (typeof a.score === 'number') scores.push(a.score)
      if (typeof a.likert === 'number') likerts.push(a.likert)
    }
    summary.meanScore = scores.length === 0 ? 0 : scores.reduce((s, v) => s + v, 0) / scores.length
    summary.meanLikert = likerts.length === 0 ? 0 : likerts.reduce((s, v) => s + v, 0) / likerts.length
  } else if (q.type === 'single' || q.type === 'multi') {
    const counts: Record<string, number> = {}
    for (const a of answers) {
      const picked = q.type === 'single' ? (a.choice ? [a.choice] : []) : (a.choices ?? [])
      for (const c of picked) counts[c] = (counts[c] ?? 0) + 1
    }
    const dist: PersonaSurveyChoiceCount[] = Object.entries(counts)
      .map(([choice, count]) => ({ choice, count }))
      .sort((a, b) => b.count - a.count)
    summary.choiceDistribution = dist
  }
  return summary
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const source: PersonaSurveyFillSource = body.source === 'pasted' ? 'pasted' : 'csv'
  const personaIds: number[] = Array.isArray(body.personaIds)
    ? body.personaIds.map((n: unknown) => Number(n)).filter((n: number) => Number.isFinite(n) && n > 0)
    : []

  if (personaIds.length === 0) {
    return NextResponse.json({ error: '至少需要 1 位 persona' }, { status: 400 })
  }
  if (personaIds.length > MAX_PERSONAS) {
    return NextResponse.json({ error: `單次最多 ${MAX_PERSONAS} 位 persona` }, { status: 400 })
  }

  let questions: SurveyQuestion[] = []
  let surveyTitle = ''
  let surveyId: number | undefined

  if (source === 'csv') {
    const sid = Number(body.surveyId)
    if (!Number.isFinite(sid)) {
      return NextResponse.json({ error: 'csv mode 需要 surveyId' }, { status: 400 })
    }
    const headerList: string[] = Array.isArray(body.questions)
      ? body.questions.map((s: unknown) => String(s ?? '').trim()).filter(Boolean)
      : []
    if (headerList.length === 0) {
      return NextResponse.json({ error: '至少需要 1 題' }, { status: 400 })
    }
    const loaded = await loadSurveyCsv(sid)
    if ('error' in loaded) {
      return NextResponse.json({ error: loaded.error }, { status: loaded.status })
    }
    const validHeaders = new Set(loaded.headers)
    const invalid = headerList.filter(q => !validHeaders.has(q))
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: `題目不在 survey 欄位中：${invalid.join('、')}` },
        { status: 400 },
      )
    }
    questions = headerList.map(h => ({
      type: 'likert',
      text: h,
      scale: { min: 1, max: 5 },
    }))
    surveyTitle = loaded.doc.title
    surveyId = loaded.doc.id
  } else {
    const raw = Array.isArray(body.questions) ? body.questions : []
    for (const r of raw) {
      const q = sanitizePastedQuestion(r)
      if (q) questions.push(q)
    }
    if (questions.length === 0) {
      return NextResponse.json({ error: '貼上的題目格式不正確' }, { status: 400 })
    }
    surveyTitle = String(body.surveyTitle ?? '').trim() || `貼上問卷（${questions.length} 題）`
  }

  if (questions.length > MAX_QUESTIONS) {
    return NextResponse.json({ error: `單次最多 ${MAX_QUESTIONS} 題` }, { status: 400 })
  }

  const personas: Persona[] = []
  for (const id of personaIds) {
    const p = getPersona(id)
    if (!p) return NextResponse.json({ error: `persona ${id} not found` }, { status: 404 })
    personas.push(p)
  }

  const neededQuota = personas.length * questions.length
  const quota = getQuotaStatus('gemini_chat')
  if (quota.remaining < neededQuota) {
    return NextResponse.json(
      {
        error: `額度不足：需要 ${neededQuota}（${personas.length} 位 × ${questions.length} 題），剩餘 ${quota.remaining}`,
        quota,
      },
      { status: 429 },
    )
  }

  const responses: PersonaSurveyResponse[] = await Promise.all(
    personas.map(async (persona) => {
      const answerResults = await Promise.allSettled(
        questions.map(q => answerQuestion(persona, q)),
      )
      const answers: PersonaSurveyAnswer[] = []
      const errors: string[] = []
      answerResults.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          answers.push(r.value)
          incrementQuota('gemini_chat')
        } else {
          errors.push(`「${questions[i].text}」: ${(r.reason as Error).message}`)
        }
      })
      return {
        personaId: persona.id,
        personaName: persona.name,
        answers,
        ...(errors.length > 0 ? { error: errors.join('；') } : {}),
      }
    }),
  )

  const summary = questions.map(q => summarizeQuestion(q, responses))

  const run = saveRun({
    source,
    surveyId,
    surveyTitle,
    personaIds,
    questions,
    responses,
    summary,
  })

  return NextResponse.json({
    run,
    quota: getQuotaStatus('gemini_chat'),
  })
}

function sanitizePastedQuestion(raw: unknown): SurveyQuestion | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const type = String(o.type ?? '')
  if (!['single', 'multi', 'likert', 'open'].includes(type)) return null
  const text = String(o.text ?? '').trim()
  if (!text) return null
  const q: SurveyQuestion = { type: type as SurveyQuestion['type'], text }
  if (type === 'single' || type === 'multi') {
    const opts = Array.isArray(o.options)
      ? o.options.map(x => String(x ?? '').trim()).filter(Boolean)
      : []
    if (opts.length < 2) return null
    q.options = opts
  } else if (type === 'likert') {
    const s = (o.scale ?? {}) as Record<string, unknown>
    const min = Number(s.min ?? 1)
    const max = Number(s.max ?? 5)
    q.scale = Number.isFinite(min) && Number.isFinite(max) && max > min
      ? { min, max }
      : { min: 1, max: 5 }
    if (typeof s.minLabel === 'string') q.scale.minLabel = s.minLabel
    if (typeof s.maxLabel === 'string') q.scale.maxLabel = s.maxLabel
  }
  return q
}
