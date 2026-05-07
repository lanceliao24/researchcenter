import { NextRequest, NextResponse } from 'next/server'
import Papa from 'papaparse'
import { isLocalMode } from '@/lib/local-mode'
import {
  computeMonthlyMetrics,
  getMonth,
  normalizeRow,
} from '@/lib/monthly-survey-metrics'
import {
  loadMonthRawRows,
  upsertMetrics,
  upsertMonthRawRows,
} from '@/lib/monthly-survey-store'
import type { SurveyMonthlyImportResult, SurveyMonthlyRawRow } from '@/types'
import { requireEditor } from '@/lib/auth'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const auth = await requireEditor(req)
  if (auth instanceof NextResponse) return auth
  if (!isLocalMode()) {
    return NextResponse.json(
      { error: 'production import not yet implemented' },
      { status: 501 },
    )
  }

  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 })
  }

  const text = await file.text()
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  })

  const rows: SurveyMonthlyRawRow[] = []
  let skipped = 0
  for (const r of parsed.data) {
    const n = normalizeRow(r)
    if (n) rows.push(n)
    else skipped += 1
  }

  if (rows.length === 0) {
    return NextResponse.json(
      { error: 'no valid rows after parsing', skipped, parseErrors: parsed.errors.length },
      { status: 400 },
    )
  }

  const byMonth = new Map<string, SurveyMonthlyRawRow[]>()
  for (const r of rows) {
    const m = getMonth(r.updated_at)
    if (!m) continue
    const arr = byMonth.get(m) ?? []
    arr.push(r)
    byMonth.set(m, arr)
  }

  const allMonthRows: SurveyMonthlyRawRow[] = []
  for (const [month, monthRows] of byMonth) {
    const merged = upsertMonthRawRows(month, monthRows)
    allMonthRows.push(...merged)
  }

  const metrics = computeMonthlyMetrics(allMonthRows)
  upsertMetrics(metrics)

  const affected: Record<string, Record<string, number>> = {}
  for (const [month, monthRows] of byMonth) {
    affected[month] = {}
    for (const r of monthRows) {
      affected[month][r.service] = (affected[month][r.service] ?? 0) + 1
    }
  }

  const result: SurveyMonthlyImportResult = {
    imported_months: Array.from(byMonth.keys()).sort(),
    affected,
    total_rows: rows.length,
    skipped,
  }
  return NextResponse.json(result)
}
