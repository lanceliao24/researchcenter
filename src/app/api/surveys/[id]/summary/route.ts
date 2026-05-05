import { NextRequest, NextResponse } from 'next/server'
import Papa from 'papaparse'
import { isLocalMode } from '@/lib/local-mode'
import { chatLite } from '@/lib/gemini'
import { getQuotaStatus, incrementQuota } from '@/lib/quota'
import {
  getSurveySummary,
  saveSurveySummary,
  clearSurveySummary,
  type SurveySummary,
  type SurveySummaryTheme,
} from '@/lib/survey-summary-store'

const SAMPLE_SIZE = 150
const CHAR_CAP = 200
const OPEN_ENDED_MIN_AVG = 15

function sampleRows<T>(rows: T[], n: number): T[] {
  if (rows.length <= n) return rows
  const copy = [...rows]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy.slice(0, n)
}

function pickOpenEndedColumns(
  rows: Record<string, unknown>[],
  headers: string[],
): string[] {
  if (rows.length === 0) return []
  const stats = headers.map(h => {
    const values = rows.map(r => String(r[h] ?? '').trim())
    const nonEmpty = values.filter(v => v.length > 0)
    const avgLen = nonEmpty.length === 0
      ? 0
      : nonEmpty.reduce((sum, v) => sum + v.length, 0) / nonEmpty.length
    return { header: h, avgLen, fillRate: nonEmpty.length / rows.length }
  })

  const passing = stats.filter(s => s.avgLen >= OPEN_ENDED_MIN_AVG && s.fillRate >= 0.1)
  if (passing.length > 0) {
    return passing
      .sort((a, b) => b.avgLen - a.avgLen)
      .slice(0, 5)
      .map(s => s.header)
  }
  // fallback: top 3 longest columns
  return stats
    .filter(s => s.avgLen > 0)
    .sort((a, b) => b.avgLen - a.avgLen)
    .slice(0, 3)
    .map(s => s.header)
}

function buildCorpus(
  rows: Record<string, unknown>[],
  openEndedCols: string[],
): string {
  const blocks: string[] = []
  rows.forEach((row, idx) => {
    const parts: string[] = []
    for (const col of openEndedCols) {
      const raw = String(row[col] ?? '').trim()
      if (!raw) continue
      const truncated = raw.length > CHAR_CAP ? raw.slice(0, CHAR_CAP) + '…' : raw
      parts.push(`  ${col}: ${truncated}`)
    }
    if (parts.length > 0) {
      blocks.push(`[R${idx + 1}]\n${parts.join('\n')}`)
    }
  })
  return blocks.join('\n\n')
}

const SYSTEM_PROMPT = `你是 UX 研究員，擅長從問卷開放式回答中歸納出 Top 5 高頻主題，並挑選最具代表性的原文引言。

必須輸出合法 JSON，不可包含 markdown 或其他文字，格式：

{
  "themes": [
    {
      "title": "主題名稱（10 字內）",
      "description": "主題說明（30 字內，說明這群受訪者在意什麼）",
      "frequency_estimate": "估計比例或次數（例：約 18% 或 約 27 筆）",
      "quote": "最能代表這個主題的原文引言（完整保留，最多 60 字；若原文更短則照實給出）",
      "quote_source": "該引言所在的欄位名稱（請用提供的欄位名）"
    }
  ]
}

規則：
- 依照頻率由高到低排序
- 正好 5 個主題；若樣本不足以抽出 5 個，給出真的觀察到的數量
- quote 必須是原文直接摘錄，不可改寫、不可翻譯
- 繁體中文，可自然夾雜英文`

function parseSummaryJson(raw: string): { themes: SurveySummaryTheme[] } {
  const cleaned = raw.replace(/^```json\s*|\s*```$/g, '').replace(/^```\s*|\s*```$/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end < 0) throw new Error('AI 回傳非 JSON')
  const json = JSON.parse(cleaned.slice(start, end + 1))
  if (!Array.isArray(json.themes)) throw new Error('AI 回傳缺少 themes')
  return { themes: json.themes.slice(0, 5) }
}

async function loadCsvContent(docId: number): Promise<string | null> {
  if (!isLocalMode()) return null
  const { getLocalDocuments, readUploadedFile } = await import('@/lib/local-store')
  const docs = getLocalDocuments()
  const doc = docs.find(d => d.id === docId)
  if (!doc || !doc.file_path) return null
  return readUploadedFile(doc.file_path)
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  const docId = Number(id)
  if (!Number.isFinite(docId)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }
  return NextResponse.json({
    summary: getSurveySummary(docId) ?? null,
    quota: getQuotaStatus('gemini_chat'),
  })
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  const docId = Number(id)
  clearSurveySummary(docId)
  return NextResponse.json({ ok: true })
}

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  const docId = Number(id)
  if (!Number.isFinite(docId)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }

  const quota = getQuotaStatus('gemini_chat')
  if (quota.remaining <= 0) {
    return NextResponse.json(
      { error: `今日 AI 額度已用完 (${quota.used}/${quota.limit})`, quota },
      { status: 429 },
    )
  }

  const content = await loadCsvContent(docId)
  if (!content) {
    return NextResponse.json({ error: '找不到檔案或非本地模式' }, { status: 404 })
  }

  const parsed = Papa.parse(content, { header: true, skipEmptyLines: true })
  const headers = (parsed.meta.fields ?? []).filter(Boolean)
  const rows = (parsed.data as Record<string, unknown>[]).filter(r =>
    headers.some(h => String(r[h] ?? '').trim().length > 0),
  )
  if (rows.length === 0) {
    return NextResponse.json({ error: 'CSV 無有效資料' }, { status: 400 })
  }

  const openEndedCols = pickOpenEndedColumns(rows, headers)
  if (openEndedCols.length === 0) {
    return NextResponse.json(
      { error: '無法偵測到文字類開放式欄位，目前 Top5 摘要不適用此問卷' },
      { status: 400 },
    )
  }

  const sampled = sampleRows(rows, SAMPLE_SIZE)
  const corpus = buildCorpus(sampled, openEndedCols)

  const userPrompt = `以下是 ${sampled.length} 筆問卷回答（從總共 ${rows.length} 筆中隨機採樣）。

開放式欄位：${openEndedCols.join('、')}

${corpus}

請產出 Top 5 主題 JSON：`

  try {
    const raw = await chatLite(SYSTEM_PROMPT, userPrompt)
    incrementQuota('gemini_chat')
    const { themes } = parseSummaryJson(raw)
    const summary: SurveySummary = {
      documentId: docId,
      themes,
      totalRows: rows.length,
      sampledRows: sampled.length,
      openEndedColumns: openEndedCols,
      generatedAt: new Date().toISOString(),
    }
    saveSurveySummary(summary)
    return NextResponse.json({ summary, quota: getQuotaStatus('gemini_chat') })
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message, quota: getQuotaStatus('gemini_chat') },
      { status: 500 },
    )
  }
}
