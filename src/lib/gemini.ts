import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

const EMBEDDING_MODELS = ['gemini-embedding-001', 'gemini-embedding-2', 'gemini-embedding-2-preview']

async function embedWithFallback(text: string): Promise<number[]> {
  let lastErr: unknown
  for (const modelName of EMBEDDING_MODELS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName })
      const result = await model.embedContent(text)
      return result.embedding.values
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr
}

export async function generateEmbedding(text: string): Promise<number[]> {
  return embedWithFallback(text)
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  return Promise.all(texts.map(t => embedWithFallback(t)))
}

const CHAT_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-flash-latest']
const LITE_MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-flash-latest']

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function isRetryable(err: unknown): boolean {
  const e = err as { status?: number; message?: string }
  if (e?.status === 503 || e?.status === 429 || e?.status === 500) return true
  return /503|overloaded|unavailable|high demand/i.test(e?.message ?? '')
}

async function chatWithModels(
  models: string[],
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  let lastErr: unknown
  for (const modelName of models) {
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: systemPrompt,
    })
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await model.generateContent(userMessage)
        return result.response.text()
      } catch (err) {
        lastErr = err
        if (!isRetryable(err)) throw err
        await sleep(500 * (attempt + 1))
      }
    }
  }
  throw lastErr
}

export async function chat(systemPrompt: string, userMessage: string): Promise<string> {
  return chatWithModels(CHAT_MODELS, systemPrompt, userMessage)
}

export async function chatLite(systemPrompt: string, userMessage: string): Promise<string> {
  return chatWithModels(LITE_MODELS, systemPrompt, userMessage)
}

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatImagePart {
  data: string
  mimeType: string
}

export type MultimodalPart =
  | { text: string }
  | { inlineData: { data: string; mimeType: string } }

export async function generateMultimodal(
  systemPrompt: string,
  parts: MultimodalPart[]
): Promise<string> {
  let lastErr: unknown
  for (const modelName of CHAT_MODELS) {
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: systemPrompt,
    })
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await model.generateContent(parts)
        return result.response.text()
      } catch (err) {
        lastErr = err
        if (!isRetryable(err)) throw err
        await sleep(500 * (attempt + 1))
      }
    }
  }
  throw lastErr
}

export async function chatWithHistory(
  systemPrompt: string,
  history: ChatTurn[],
  userMessage: string,
  userImages: ChatImagePart[] = []
): Promise<string> {
  let lastErr: unknown
  const geminiHistory = history.map(t => ({
    role: t.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: t.content }],
  }))
  const userParts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = []
  for (const img of userImages) {
    userParts.push({ inlineData: { data: img.data, mimeType: img.mimeType } })
  }
  if (userMessage) userParts.push({ text: userMessage })
  if (userParts.length === 0) userParts.push({ text: '' })

  for (const modelName of CHAT_MODELS) {
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: systemPrompt,
    })
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const session = model.startChat({ history: geminiHistory })
        const result = await session.sendMessage(userParts)
        return result.response.text()
      } catch (err) {
        lastErr = err
        if (!isRetryable(err)) throw err
        await sleep(500 * (attempt + 1))
      }
    }
  }
  throw lastErr
}

export async function analyzeSentiment(text: string): Promise<'positive' | 'neutral' | 'negative'> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
  const result = await model.generateContent(
    `分析以下文字的情緒傾向，只回覆一個詞：positive、neutral 或 negative。\n\n文字：${text}`
  )
  const response = result.response.text().trim().toLowerCase()
  if (response.includes('positive')) return 'positive'
  if (response.includes('negative')) return 'negative'
  return 'neutral'
}
