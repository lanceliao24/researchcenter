import { NextResponse } from 'next/server'
import { chat } from '@/lib/gemini'
import { checkQuota, incrementQuota } from '@/lib/quota'
import { isLocalMode } from '@/lib/local-mode'
import {
  getMonthlyOverview,
  listMetricsByMonth,
  listMonths,
  loadMonthRawRows,
} from '@/lib/monthly-survey-store'
import {
  buildCsatNpsCross,
  buildPainPoints,
  buildWeeklyTrend,
} from '@/lib/monthly-survey-metrics'
import {
  readReport,
  writeReport,
  type ReportFinding,
} from '@/lib/monthly-report-store'
import { surveyServiceLabel } from '@/types'

export const runtime = 'nodejs'

const SYSTEM_PROMPT = `你是 LINE GO 的資深用戶研究員。任務：把多服務的問卷數據濃縮成可行動的月度體驗報告。

報告結構：
- headline：1 句話總結本月（≤30 中文字）
- findings：5–7 條，每條包含
  - title：≤18 字標題
  - evidence：用具體數字描述發現（保留小數位）
  - recommendation：1 句話的建議行動，要 actionable，不能是空泛口號
  - tone：positive（亮點）／warning（需注意）／info（觀察）
  - source：簡短註明資料來源（例如：「計程車問卷」「共享機車週走勢」）

規則：
- 每條 finding 必須引用具體數字
- 至少 3 條 warning（除非完全沒有負面訊號）
- 涵蓋多個服務，不要全部聚焦同一個
- **週度波動 finding 的門檻**：兩週的 satisfied_pct 或 NPS 落差 ≥ 5pp，**且**比較的兩週各自 sample size n ≥ 10。樣本不足的週（n < 10）視為雜訊，不要列為 finding，也不要在其他 finding 中引用其數字
- 符合上述門檻的劇烈波動，優先列為 finding 之一
- 推薦行動具體：例如「在問卷補上『LinePay 綁定問題』選項」優於「改善支付體驗」

回傳純 JSON：
{
  "headline": string,
  "findings": [
    { "title": string, "evidence": string, "recommendation": string, "tone": "positive"|"warning"|"info", "source": string }
  ]
}`

function buildUserMessage(month: string): string {
  const lines: string[] = []
  const overall = getMonthlyOverview(month)
  if (!overall) return ''

  lines.push(`【${month} 整體】`)
  lines.push(
    `- 總填答 ${overall.responses.toLocaleString()} ・ 滿意度 ${overall.satisfied_pct.toFixed(1)}% ・ 標準化滿意分 ${((overall.satisfaction_avg / 5) * 100).toFixed(1)}% ・ NPS ${overall.nps >= 0 ? '+' : ''}${overall.nps.toFixed(1)}`,
  )
  lines.push('')

  const metrics = listMetricsByMonth(month)
  const allRows = loadMonthRawRows(month)

  for (const m of metrics) {
    const rows = allRows.filter(r => r.service === m.service)
    if (rows.length < 5) continue
    const cross = buildCsatNpsCross(rows)
    const pains = buildPainPoints(rows).slice(0, 3)
    const weekly = buildWeeklyTrend(rows)

    lines.push(`【${surveyServiceLabel(m.service)} (${m.service}) - ${m.responses.toLocaleString()} 筆】`)
    lines.push(
      `- 滿意度 ${m.satisfied_pct.toFixed(1)}% ・ NPS ${m.nps >= 0 ? '+' : ''}${m.nps.toFixed(1)} ・ 占當月 ${m.weight_pct.toFixed(1)}%`,
    )
    if (weekly.length >= 2) {
      const segs = weekly.map(w => `${w.week}(n=${w.count}, sat ${w.satisfied_pct.toFixed(1)}%, NPS ${w.nps >= 0 ? '+' : ''}${w.nps.toFixed(1)})`).join(' → ')
      lines.push(`- 週走勢：${segs}`)
      const satMax = Math.max(...weekly.map(w => w.satisfied_pct))
      const satMin = Math.min(...weekly.map(w => w.satisfied_pct))
      const npsMax = Math.max(...weekly.map(w => w.nps))
      const npsMin = Math.min(...weekly.map(w => w.nps))
      const satRange = satMax - satMin
      const npsRange = npsMax - npsMin
      if (satRange >= 5 || npsRange >= 5) {
        lines.push(
          `  → 週間波動：滿意度 ${satRange.toFixed(1)}pp（${satMin.toFixed(1)}–${satMax.toFixed(1)}）、NPS ${npsRange.toFixed(1)}pp（${npsMin.toFixed(1)}–${npsMax.toFixed(1)}）`,
        )
      }
    }
    if (cross.loyal.count > 0) {
      lines.push(
        `- 忠誠用戶（CSAT=5）${cross.loyal.count} 人，NPS ${cross.loyal.nps.toFixed(1)}（理想 100）`,
      )
    }
    if (cross.unhappy.count > 0) {
      const detractorShare = (cross.unhappy.detractors / cross.unhappy.count) * 100
      lines.push(
        `- 不滿用戶（CSAT 1–2）${cross.unhappy.count} 人，其中 ${detractorShare.toFixed(1)}% 是 NPS detractor`,
      )
    }
    if (pains.length > 0) {
      lines.push(`- Top 痛點（priority = 頻次×不滿）：`)
      for (const p of pains) {
        lines.push(
          `  ・「${p.label}」勾選 ${p.count} 次 (${p.pct.toFixed(1)}%)、該群 CSAT ${p.avgCsat.toFixed(2)}、NPS ${p.avgNps.toFixed(1)}`,
        )
      }
    }
    lines.push('')
  }

  return lines.join('\n')
}

interface RawReport {
  headline?: unknown
  findings?: unknown
}

function parseReport(raw: string): { headline: string; findings: ReportFinding[] } | null {
  const cleaned = raw.replace(/```json\s*|```/g, '').trim()
  try {
    const parsed = JSON.parse(cleaned) as RawReport
    if (!Array.isArray(parsed.findings)) return null
    const findings: ReportFinding[] = []
    for (const it of parsed.findings) {
      const obj = it as Record<string, unknown>
      const title = typeof obj.title === 'string' ? obj.title : ''
      const evidence = typeof obj.evidence === 'string' ? obj.evidence : ''
      const recommendation = typeof obj.recommendation === 'string' ? obj.recommendation : ''
      const tone: ReportFinding['tone'] =
        obj.tone === 'positive' || obj.tone === 'warning' || obj.tone === 'info' ? obj.tone : 'info'
      const source = typeof obj.source === 'string' ? obj.source : ''
      if (title && evidence && recommendation) {
        findings.push({ title, evidence, recommendation, tone, source })
      }
    }
    return {
      headline: typeof parsed.headline === 'string' ? parsed.headline : '',
      findings: findings.slice(0, 7),
    }
  } catch {
    return null
  }
}

export async function GET() {
  return NextResponse.json({ snapshot: readReport() })
}

export async function POST() {
  if (!isLocalMode()) {
    return NextResponse.json({ error: 'production not implemented' }, { status: 501 })
  }
  const months = listMonths()
  if (months.length === 0) {
    return NextResponse.json({ error: '尚未匯入月度問卷' }, { status: 400 })
  }
  const month = months[0]
  const overall = getMonthlyOverview(month)
  if (!overall) {
    return NextResponse.json({ error: '無法取得整體指標' }, { status: 400 })
  }

  const q = checkQuota('gemini_chat')
  if (!q.ok) {
    return NextResponse.json({ error: 'quota exceeded', used: q.used, limit: q.limit }, { status: 429 })
  }

  const userMsg = buildUserMessage(month)
  let parsed
  try {
    const raw = await chat(SYSTEM_PROMPT, userMsg)
    parsed = parseReport(raw)
    incrementQuota('gemini_chat')
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }

  if (!parsed || parsed.findings.length === 0) {
    return NextResponse.json({ error: 'AI 回傳格式無法解析' }, { status: 500 })
  }

  const snapshot = {
    month,
    generatedAt: new Date().toISOString(),
    headline: parsed.headline,
    findings: parsed.findings,
    overall: {
      responses: overall.responses,
      serviceCount: overall.serviceCount,
      satisfied_pct: overall.satisfied_pct,
      nps: overall.nps,
    },
  }
  writeReport(snapshot)
  return NextResponse.json({ snapshot })
}
