export type UploadType = 'report' | 'survey' | 'transcript'

export const MAX_BYTES_BY_TYPE: Record<UploadType, number> = {
  report: 25 * 1024 * 1024,
  survey: 10 * 1024 * 1024,
  transcript: 5 * 1024 * 1024,
}

export const ALLOWED_EXTENSIONS_BY_TYPE: Record<UploadType, string[]> = {
  report: ['.pdf', '.pptx', '.yml', '.yaml'],
  survey: ['.csv'],
  transcript: ['.txt', '.md', '.csv'],
}

const MAGIC = {
  pdf: [0x25, 0x50, 0x44, 0x46, 0x2d],
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  jpg: [0xff, 0xd8, 0xff],
  gif: [0x47, 0x49, 0x46, 0x38],
  webp_riff: [0x52, 0x49, 0x46, 0x46],
  webp_sig: [0x57, 0x45, 0x42, 0x50],
  zip: [0x50, 0x4b, 0x03, 0x04],
  zip_empty: [0x50, 0x4b, 0x05, 0x06],
  zip_spanned: [0x50, 0x4b, 0x07, 0x08],
} as const

function startsWith(buf: Buffer, sig: readonly number[]): boolean {
  if (buf.length < sig.length) return false
  for (let i = 0; i < sig.length; i++) if (buf[i] !== sig[i]) return false
  return true
}

export type DetectedKind =
  | 'pdf'
  | 'pptx'
  | 'png'
  | 'jpg'
  | 'gif'
  | 'webp'
  | 'text'
  | 'unknown'

export function detectKind(buf: Buffer): DetectedKind {
  if (startsWith(buf, MAGIC.pdf)) return 'pdf'
  if (startsWith(buf, MAGIC.png)) return 'png'
  if (startsWith(buf, MAGIC.jpg)) return 'jpg'
  if (startsWith(buf, MAGIC.gif)) return 'gif'
  if (
    startsWith(buf, MAGIC.webp_riff) &&
    buf.length >= 12 &&
    startsWith(buf.subarray(8), MAGIC.webp_sig)
  ) {
    return 'webp'
  }
  if (
    startsWith(buf, MAGIC.zip) ||
    startsWith(buf, MAGIC.zip_empty) ||
    startsWith(buf, MAGIC.zip_spanned)
  ) {
    return 'pptx'
  }
  if (looksLikeText(buf)) return 'text'
  return 'unknown'
}

function looksLikeText(buf: Buffer): boolean {
  const sample = buf.subarray(0, Math.min(buf.length, 4096))
  for (const b of sample) {
    if (b === 0) return false
    if (b < 0x09) return false
    if (b > 0x0d && b < 0x20 && b !== 0x1b) return false
  }
  return true
}

export function getExtension(filename: string): string {
  const m = filename.toLowerCase().match(/\.[a-z0-9]+$/)
  return m ? m[0] : ''
}

export interface ValidationOk {
  ok: true
  detected: DetectedKind
}
export interface ValidationFail {
  ok: false
  reason: string
}
export type ValidationResult = ValidationOk | ValidationFail

const KIND_BY_EXT: Record<string, DetectedKind | DetectedKind[]> = {
  '.pdf': 'pdf',
  '.pptx': 'pptx',
  '.png': 'png',
  '.jpg': 'jpg',
  '.jpeg': 'jpg',
  '.gif': 'gif',
  '.webp': 'webp',
  '.csv': 'text',
  '.txt': 'text',
  '.md': 'text',
  '.yml': 'text',
  '.yaml': 'text',
}

export function validateUploadFile(
  buf: Buffer,
  filename: string,
  type: UploadType,
): ValidationResult {
  const limit = MAX_BYTES_BY_TYPE[type]
  if (buf.length === 0) return { ok: false, reason: '檔案為空' }
  if (buf.length > limit) {
    return {
      ok: false,
      reason: `檔案過大：${(buf.length / 1024 / 1024).toFixed(1)}MB（上限 ${limit / 1024 / 1024}MB）`,
    }
  }

  const ext = getExtension(filename)
  if (!ext) return { ok: false, reason: '檔名缺少副檔名' }

  const allowedExts = ALLOWED_EXTENSIONS_BY_TYPE[type]
  if (!allowedExts.includes(ext)) {
    return {
      ok: false,
      reason: `不支援的副檔名 ${ext}（${type} 僅接受 ${allowedExts.join(' / ')}）`,
    }
  }

  const expected = KIND_BY_EXT[ext]
  const detected = detectKind(buf)
  const expectedKinds = Array.isArray(expected) ? expected : [expected]
  if (!expectedKinds.includes(detected)) {
    return {
      ok: false,
      reason: `檔案內容與副檔名不符：聲明 ${ext}，實際偵測為 ${detected}`,
    }
  }

  return { ok: true, detected }
}

export function safeFilename(filename: string, fallback = 'file'): string {
  const base = filename
    .replace(/[\x00-\x1f]+/g, '')
    .replace(/[/\\:*?"<>|]+/g, '_')
    .replace(/^\.+/, '')
    .trim()
  const sliced = base.slice(0, 200)
  return sliced || fallback
}
