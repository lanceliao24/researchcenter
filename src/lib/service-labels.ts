// Client-safe service label lookup. Kept separate from
// issue-trends-store.ts (which imports `fs`) so the table can be used
// in client components without pulling Node-only modules into the
// browser bundle.

export const SERVICE_LABELS: Record<string, string> = {
  taxi: '計程車',
  rental: '共享汽車',
  scooter: '共享機車',
  designated_driver: '代駕',
  shuttle: '機場接送',
  station_rental: '站點租車',
  charging: '充電',
  chauffeured_car: '包車',
  other: '其他',
}

export function getServiceLabel(service: string): string {
  return SERVICE_LABELS[service] ?? service
}
