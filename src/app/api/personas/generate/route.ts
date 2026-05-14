import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'
import { parseTranscript, groupBySpeaker, pickInterviewees, buildSpeakerDigest } from '@/lib/transcript-parser'
import { upsertPersonaFromSource, inferCategoryFromFile } from '@/lib/persona-store'
import { chatPro } from '@/lib/gemini'
import { getQuotaStatus, checkQuota, incrementQuota, quotaDeniedMessage } from '@/lib/quota'
import type { Persona, PersonaCategory } from '@/types'

const VALID_CATEGORIES: PersonaCategory[] = ['rental', 'taxi', 'scooter', 'other']

const SYSTEM_PROMPT = `你是一位 UX 研究員，擅長從使用者訪談逐字稿中萃取 persona。
根據提供的逐字稿片段（來自同一位受訪者），產出一份結構化 persona，用於後續產品測試。
輸出必須是合法 JSON，不可包含其他文字或 markdown，格式如下：

{
  "name": "姓名（化名，繁體中文，例如『林家豪』）",
  "age_range": "年齡區間，例如 25-30",
  "gender": "男/女/未揭露",
  "occupation": "職業或身份（例如學生、工程師、業務）",
  "location": "居住或活動地區（例如台北市、新北市、未揭露）",
  "summary": "一句話 persona 摘要（30 字內）",
  "background": "背景與生活情境描述（2-3 句）",
  "goals": ["想達成的目標1", "目標2", "目標3"],
  "pain_points": ["痛點1", "痛點2", "痛點3"],
  "behaviors": ["使用行為1", "行為2", "行為3"],
  "service_preferences": ["對租車/計程車/機車的偏好，逐條列"],
  "quotes": ["原文金句1（直接引用）", "金句2"],
  "tags": ["標籤1", "標籤2", "標籤3"]
}

規則：
- name 請用常見的台灣化名，不可重複使用同一個名字。
- 不要捏造未出現的資訊；若無法判斷就寫「未揭露」。
- quotes 必須是原文中的句子（可略微修剪但不可改寫）。
- 用繁體中文。`

async function generatePersonaJson(digest: string, seed: string): Promise<Record<string, unknown>> {
  const userMessage = `以下是受訪者「${seed}」的訪談片段：\n\n${digest}\n\n請產出 persona JSON：`
  const raw = await chatPro(SYSTEM_PROMPT, userMessage)
  const cleaned = raw.replace(/^```json\s*|\s*```$/g, '').replace(/^```\s*|\s*```$/g, '').trim()
  const jsonStart = cleaned.indexOf('{')
  const jsonEnd = cleaned.lastIndexOf('}')
  if (jsonStart < 0 || jsonEnd < 0) throw new Error('No JSON in response')
  return JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1))
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const inputPath: string = body.filePath || '/Users/lanceliao/Downloads/rental.yml'
  const minTurns: number = body.minTurns ?? 30
  const minWords: number = body.minWords ?? 500
  const limit: number = body.limit ?? 20

  if (!fs.existsSync(inputPath)) {
    return NextResponse.json({ error: `file not found: ${inputPath}` }, { status: 400 })
  }

  const sourceFileName = path.basename(inputPath)
  const category: PersonaCategory = VALID_CATEGORIES.includes(body.category)
    ? body.category
    : inferCategoryFromFile(sourceFileName)

  const turns = parseTranscript(inputPath)
  const profiles = groupBySpeaker(turns)
  const interviewees = pickInterviewees(profiles, { minTurns, minWords, maxQuestionRatio: 0.5 })
  const selected = interviewees.slice(0, limit)

  const q = checkQuota('gemini_chat_pro')
  if (!q.ok) {
    return NextResponse.json(
      {
        error: quotaDeniedMessage('gemini_chat_pro', q.used, q.limit),
        quota: getQuotaStatus('gemini_chat_pro'),
        eligible: interviewees.length,
      },
      { status: 429 },
    )
  }

  const sourceFile = path.resolve(inputPath)
  const total = selected.length

  // NDJSON streaming response — one event per line.
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))
      }

      emit({
        type: 'start',
        total,
        eligible: interviewees.length,
        totalSpeakers: profiles.length,
      })

      const created: Persona[] = []
      const errors: { speaker: string; error: string }[] = []

      for (let i = 0; i < selected.length; i++) {
        const profile = selected[i]
        try {
          const digest = buildSpeakerDigest(profile, 8000)
          const json = await generatePersonaJson(digest, profile.speaker)
          incrementQuota('gemini_chat_pro')
          const persona = upsertPersonaFromSource({
            name: String(json.name ?? profile.speaker),
            category,
            age_range: String(json.age_range ?? '未揭露'),
            gender: String(json.gender ?? '未揭露'),
            occupation: String(json.occupation ?? '未揭露'),
            location: String(json.location ?? '未揭露'),
            summary: String(json.summary ?? ''),
            background: String(json.background ?? ''),
            goals: Array.isArray(json.goals) ? json.goals.map(String) : [],
            pain_points: Array.isArray(json.pain_points) ? json.pain_points.map(String) : [],
            behaviors: Array.isArray(json.behaviors) ? json.behaviors.map(String) : [],
            service_preferences: Array.isArray(json.service_preferences) ? json.service_preferences.map(String) : [],
            quotes: Array.isArray(json.quotes) ? json.quotes.map(String) : [],
            tags: Array.isArray(json.tags) ? json.tags.map(String) : [],
            transcript_digest: digest,
            source: {
              file: sourceFile,
              speaker: profile.speaker,
              utterance_count: profile.turnCount,
            },
          })
          created.push(persona)

          try {
            const { indexPersonaQuotes } = await import('@/lib/rag/persona-indexer')
            await indexPersonaQuotes(persona)
          } catch (err) {
            console.error(`[persona-index] ${persona.id} failed:`, err)
          }

          emit({
            type: 'progress',
            done: i + 1,
            total,
            ok: true,
            persona: { id: persona.id, name: persona.name, speaker: profile.speaker },
          })
        } catch (err) {
          const message = (err as Error).message
          errors.push({ speaker: profile.speaker, error: message })
          emit({
            type: 'progress',
            done: i + 1,
            total,
            ok: false,
            speaker: profile.speaker,
            error: message,
          })
        }
      }

      emit({
        type: 'complete',
        created: created.length,
        errors,
        eligible: interviewees.length,
        totalSpeakers: profiles.length,
        quota: getQuotaStatus('gemini_chat_pro'),
        personas: created,
      })

      controller.close()
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache, no-transform',
    },
  })
}

export async function GET() {
  const defaultPath = '/Users/lanceliao/Downloads/rental.yml'
  if (!fs.existsSync(defaultPath)) {
    return NextResponse.json({ available: false, filePath: defaultPath })
  }
  const turns = parseTranscript(defaultPath)
  const profiles = groupBySpeaker(turns)
  const interviewees = pickInterviewees(profiles, { minTurns: 30, minWords: 500, maxQuestionRatio: 0.5 })
  return NextResponse.json({
    available: true,
    filePath: defaultPath,
    totalSpeakers: profiles.length,
    eligible: interviewees.length,
    preview: interviewees.slice(0, 30).map(p => ({
      speaker: p.speaker,
      turnCount: p.turnCount,
      wordCount: p.wordCount,
      questionRatio: Number(p.questionRatio.toFixed(2)),
    })),
    quota: getQuotaStatus('gemini_chat_pro'),
  })
}
