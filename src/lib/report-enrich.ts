import JSZip from 'jszip'
import { chatLite } from './gemini'
import { PERSONA_CATEGORIES, type PersonaCategory } from '@/types'

export interface PptxExtract {
  slides: string[]
  fullText: string
}

export async function extractPptxText(buffer: Buffer): Promise<PptxExtract> {
  const zip = await JSZip.loadAsync(buffer)
  const slideNames = Object.keys(zip.files)
    .filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => {
      const ai = Number(a.match(/slide(\d+)\.xml$/)?.[1] ?? 0)
      const bi = Number(b.match(/slide(\d+)\.xml$/)?.[1] ?? 0)
      return ai - bi
    })

  const slides: string[] = []
  for (const name of slideNames) {
    const xml = await zip.files[name].async('string')
    const texts = Array.from(xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)).map(m => m[1])
    slides.push(texts.join(' ').trim())
  }

  return { slides, fullText: slides.join('\n\n') }
}

export interface ReportEnrichment {
  category: PersonaCategory
  tags: string[]
  summary: string
}

const ENRICH_PROMPT = `你是研究報告分類員，任務是讀完一份報告內容，標記其服務別、標籤與一句話摘要。

必須輸出合法 JSON，不可包含 markdown 或其他文字，格式：

{
  "category": "租車" | "計程車" | "共享機車" | "其他",
  "tags": ["標籤1", "標籤2", "標籤3"],
  "summary": "一句話摘要（40 字內）"
}

規則：
- category 必須是四選一：租車、計程車、共享機車、其他
- tags 給 3~5 個，精簡（2~6 字），例：女性用戶、2025Q4、痛點分析、競品研究、服務設計
- summary 簡潔呈現報告核心觀察或研究對象
- 繁體中文，可自然夾雜英文`

function parseEnrichJson(raw: string): ReportEnrichment {
  const cleaned = raw.replace(/^```json\s*|\s*```$/g, '').replace(/^```\s*|\s*```$/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end < 0) throw new Error('AI 回傳非 JSON')
  const obj = JSON.parse(cleaned.slice(start, end + 1))

  const category: PersonaCategory = PERSONA_CATEGORIES.includes(obj.category)
    ? obj.category
    : '其他'
  const tags: string[] = Array.isArray(obj.tags)
    ? obj.tags.map((t: unknown) => String(t).trim()).filter(Boolean).slice(0, 5)
    : []
  const summary: string = typeof obj.summary === 'string' ? obj.summary.trim() : ''

  return { category, tags, summary }
}

export async function enrichReport(
  title: string,
  text: string,
): Promise<ReportEnrichment> {
  const CHAR_CAP = 6000
  const sample = text.length > CHAR_CAP
    ? text.slice(0, CHAR_CAP / 2) + '\n...(中略)...\n' + text.slice(text.length - CHAR_CAP / 2)
    : text

  const userPrompt = `報告檔名：${title}

報告內容（片段）：
${sample}

請分析並輸出 JSON：`

  const raw = await chatLite(ENRICH_PROMPT, userPrompt)
  return parseEnrichJson(raw)
}
