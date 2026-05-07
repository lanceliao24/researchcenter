import path from 'path'
import fs from 'fs'

export const DATA_ROOT = path.join(process.cwd(), 'data')
export const STORE_DIR = path.join(DATA_ROOT, 'store')
export const FILES_DIR = path.join(DATA_ROOT, 'files')

export const FILE_API_PREFIX = '/api/files/'

export function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

export function storePath(filename: string): string {
  ensureDir(STORE_DIR)
  return path.join(STORE_DIR, filename)
}

export function filesPath(...segments: string[]): string {
  return path.join(FILES_DIR, ...segments)
}

export function fileApiUrl(...segments: string[]): string {
  return FILE_API_PREFIX + segments.map(encodeURIComponent).join('/')
}

export function isFileApiUrl(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(FILE_API_PREFIX)
}

export function resolveFileApiUrl(url: string): string | null {
  if (!url.startsWith(FILE_API_PREFIX)) return null
  const rel = url.slice(FILE_API_PREFIX.length)
  return resolveRelativeFilePath(rel)
}

export function resolveRelativeFilePath(rel: string): string | null {
  const decoded = rel.split('/').map(seg => {
    try {
      return decodeURIComponent(seg)
    } catch {
      return seg
    }
  })
  if (decoded.some(seg => !seg || seg === '.' || seg === '..' || seg.includes('\0'))) return null
  const full = path.join(FILES_DIR, ...decoded)
  const normalized = path.resolve(full)
  const root = path.resolve(FILES_DIR)
  if (!normalized.startsWith(root + path.sep) && normalized !== root) return null
  return normalized
}
