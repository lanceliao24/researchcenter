// Single source of truth for service display labels.
//
// Storage / type literals everywhere else in the codebase use the English
// `ServiceKey` keys below. The Chinese strings only live here — change a
// label and you do NOT need to migrate any stored data.
//
// Client-safe: this module has zero Node-only imports so it can be
// pulled into client components and shared server-side stores alike.

export const SERVICE_LABELS = {
  // Core seven canonical services
  taxi: '計程車',
  rental: '共享汽車',
  scooter: '共享機車',
  station_rental: '門市日租',
  shuttle: '機場接送',
  charging: '充電站',
  chauffeured_car: '包車',
  // Survey extras
  designated_driver: '代駕',
  group: '揪團',
  // Dashboard / social classification extras
  driver: '司機端',          // 司機端視角討論（接單 / 跑單 / 靠行）
  overview: 'LINE GO 總覽',  // 跨服務社群討論統稱
  other: '其他',
} as const

export type ServiceKey = keyof typeof SERVICE_LABELS

export function getServiceLabel(key: string): string {
  return (SERVICE_LABELS as Record<string, string>)[key] ?? key
}

export function isServiceKey(value: unknown): value is ServiceKey {
  return typeof value === 'string' && value in SERVICE_LABELS
}

// Reverse lookup: Chinese label → English key. Used by classifiers that
// ask Gemini to return a Chinese category and by migration paths that
// have to accept legacy stored Chinese values.
const LABEL_TO_KEY: Record<string, ServiceKey> = (() => {
  const m: Record<string, ServiceKey> = {}
  for (const [k, v] of Object.entries(SERVICE_LABELS)) m[v] = k as ServiceKey
  // Legacy aliases — values that used to be stored before label cleanup.
  m['租車'] = 'rental'
  m['站點租車'] = 'station_rental'
  m['日租'] = 'station_rental'
  m['充電'] = 'charging'
  m['共享'] = 'rental'
  return m
})()

export function keyFromLabel(label: string): ServiceKey | null {
  return LABEL_TO_KEY[label] ?? null
}
