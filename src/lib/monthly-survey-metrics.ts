import type {
  SurveyMonthlyMetrics,
  SurveyMonthlyRawRow,
  SurveyOptionDist,
} from '@/types'

function parseJsonStringArray(value: unknown): string[] {
  if (typeof value !== 'string' || !value.trim()) return []
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) {
      return parsed.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    }
  } catch {
    // CSV escaping sometimes leaves a single quoted string instead of JSON array
  }
  return []
}

export function normalizeRow(raw: Record<string, string | undefined>): SurveyMonthlyRawRow | null {
  const nps = Number(raw.nps)
  const satisfaction = Number(raw.satisfaction)
  if (!raw.service || !raw.updated_at) return null
  if (!Number.isFinite(nps) || !Number.isFinite(satisfaction)) return null
  if (nps < 0 || nps > 10 || satisfaction < 1 || satisfaction > 5) return null
  return {
    id: Number(raw.id) || 0,
    uid: Number(raw.uid) || 0,
    service: raw.service,
    order_id: raw.order_id ?? '',
    nps,
    satisfaction,
    suggestion: parseJsonStringArray(raw.suggestion),
    other_suggestion: parseJsonStringArray(raw.other_suggestion),
    complaints: parseJsonStringArray(raw.complaints),
    other_complaints: parseJsonStringArray(raw.other_complaints),
    created_at: raw.created_at ?? '',
    completed_at: raw.completed_at ?? '',
    updated_at: raw.updated_at,
  }
}

export function getMonth(updatedAt: string): string {
  return updatedAt.slice(0, 7)
}

export function buildDist(rows: SurveyMonthlyRawRow[], pick: (r: SurveyMonthlyRawRow) => string[]): SurveyOptionDist[] {
  const counts = new Map<string, number>()
  for (const r of rows) {
    for (const v of pick(r)) {
      const k = v.trim()
      if (!k) continue
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
  }
  const total = rows.length || 1
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count, pct: (count / total) * 100 }))
    .sort((a, b) => b.count - a.count)
}

export function computeServiceMetrics(
  rows: SurveyMonthlyRawRow[],
  monthTotal: number,
  month: string,
): SurveyMonthlyMetrics | null {
  if (rows.length === 0) return null
  const responses = rows.length
  const service = rows[0].service

  let satSum = 0
  let satFour = 0
  const satDist: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }

  let promoters = 0
  let passives = 0
  let detractors = 0
  const npsDist: Record<string, number> = {}
  for (let i = 0; i <= 10; i++) npsDist[String(i)] = 0

  for (const r of rows) {
    satSum += r.satisfaction
    if (r.satisfaction >= 4) satFour += 1
    const sk = String(r.satisfaction)
    if (sk in satDist) satDist[sk] += 1

    if (r.nps >= 9) promoters += 1
    else if (r.nps >= 7) passives += 1
    else detractors += 1
    const nk = String(r.nps)
    if (nk in npsDist) npsDist[nk] += 1
  }

  return {
    month,
    service,
    responses,
    weight_pct: (responses / Math.max(1, monthTotal)) * 100,
    satisfied_pct: (satFour / responses) * 100,
    satisfaction_avg: satSum / responses,
    nps: ((promoters - detractors) / responses) * 100,
    promoters,
    passives,
    detractors,
    satisfaction_dist: satDist,
    nps_dist: npsDist,
    suggestion_dist: buildDist(rows, r => r.suggestion),
    complaint_dist: buildDist(rows, r => r.complaints),
    computed_at: new Date().toISOString(),
  }
}

export interface WeeklyPoint {
  week: string
  from: string
  to: string
  count: number
  satisfied_pct: number
  satisfaction_avg: number
  nps: number
}

export function buildWeeklyTrend(rows: SurveyMonthlyRawRow[]): WeeklyPoint[] {
  const buckets = new Map<number, SurveyMonthlyRawRow[]>()
  for (const r of rows) {
    const d = new Date(r.updated_at)
    if (Number.isNaN(d.getTime())) continue
    const day = d.getDate()
    const idx = Math.floor((day - 1) / 7)
    if (!buckets.has(idx)) buckets.set(idx, [])
    buckets.get(idx)!.push(r)
  }
  const out: WeeklyPoint[] = []
  for (const [idx, group] of [...buckets.entries()].sort((a, b) => a[0] - b[0])) {
    const fromDay = idx * 7 + 1
    const toDay = idx * 7 + 7
    let satSum = 0
    let satFour = 0
    let promoters = 0
    let detractors = 0
    for (const r of group) {
      satSum += r.satisfaction
      if (r.satisfaction >= 4) satFour += 1
      if (r.nps >= 9) promoters += 1
      else if (r.nps <= 6) detractors += 1
    }
    const count = group.length
    out.push({
      week: `W${idx + 1}`,
      from: String(fromDay),
      to: String(toDay),
      count,
      satisfied_pct: (satFour / count) * 100,
      satisfaction_avg: satSum / count,
      nps: ((promoters - detractors) / count) * 100,
    })
  }
  return out
}

export interface CsatNpsCross {
  loyal: { count: number; promoters: number; passives: number; detractors: number; nps: number }
  unhappy: { count: number; promoters: number; passives: number; detractors: number; nps: number }
}

export function buildCsatNpsCross(rows: SurveyMonthlyRawRow[]): CsatNpsCross {
  function bucket(filtered: SurveyMonthlyRawRow[]) {
    let promoters = 0
    let passives = 0
    let detractors = 0
    for (const r of filtered) {
      if (r.nps >= 9) promoters += 1
      else if (r.nps >= 7) passives += 1
      else detractors += 1
    }
    const count = filtered.length
    return {
      count,
      promoters,
      passives,
      detractors,
      nps: count > 0 ? ((promoters - detractors) / count) * 100 : 0,
    }
  }
  return {
    loyal: bucket(rows.filter(r => r.satisfaction === 5)),
    unhappy: bucket(rows.filter(r => r.satisfaction <= 2)),
  }
}

export interface PainPoint {
  label: string
  count: number
  pct: number
  avgCsat: number
  avgNps: number
  priority: number
}

export function buildPainPoints(rows: SurveyMonthlyRawRow[]): PainPoint[] {
  const map = new Map<string, { count: number; satSum: number; npsSum: number }>()
  for (const r of rows) {
    for (const c of r.complaints) {
      const k = c.trim()
      if (!k) continue
      if (!map.has(k)) map.set(k, { count: 0, satSum: 0, npsSum: 0 })
      const b = map.get(k)!
      b.count += 1
      b.satSum += r.satisfaction
      b.npsSum += r.nps
    }
  }
  const total = rows.length || 1
  const out: PainPoint[] = []
  for (const [label, b] of map) {
    const avgCsat = b.satSum / b.count
    const avgNps = b.npsSum / b.count
    const severity = 5 - avgCsat
    out.push({
      label,
      count: b.count,
      pct: (b.count / total) * 100,
      avgCsat,
      avgNps,
      priority: b.count * severity,
    })
  }
  return out.sort((a, b) => b.priority - a.priority)
}

export function computeMonthlyMetrics(rows: SurveyMonthlyRawRow[]): SurveyMonthlyMetrics[] {
  const grouped = new Map<string, SurveyMonthlyRawRow[]>()
  const monthTotals = new Map<string, number>()
  for (const r of rows) {
    const month = getMonth(r.updated_at)
    if (!month) continue
    monthTotals.set(month, (monthTotals.get(month) ?? 0) + 1)
    const key = `${month}__${r.service}`
    const arr = grouped.get(key) ?? []
    arr.push(r)
    grouped.set(key, arr)
  }
  const out: SurveyMonthlyMetrics[] = []
  for (const [key, group] of grouped) {
    const month = key.split('__')[0]
    const total = monthTotals.get(month) ?? group.length
    const m = computeServiceMetrics(group, total, month)
    if (m) out.push(m)
  }
  return out
}
