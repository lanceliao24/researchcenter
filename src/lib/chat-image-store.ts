import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { filesPath, ensureDir, fileApiUrl, FILE_API_PREFIX } from './paths'
import { detectKind } from './upload-validation'

const IMAGE_SUBDIR = 'chat-images'
const IMAGE_DIR = filesPath(IMAGE_SUBDIR)

export const ALLOWED_IMAGE_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const

export type AllowedImageMime = (typeof ALLOWED_IMAGE_MIMES)[number]

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const MAX_IMAGES_PER_MESSAGE = 3

const MIME_TO_EXT: Record<AllowedImageMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export function isAllowedImageMime(mime: string): mime is AllowedImageMime {
  return (ALLOWED_IMAGE_MIMES as readonly string[]).includes(mime)
}

export interface SavedChatImage {
  url: string
  absolutePath: string
  mime: AllowedImageMime
  size: number
}

const MIME_TO_KIND: Record<AllowedImageMime, ReturnType<typeof detectKind>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export class ImageValidationError extends Error {}

export function saveChatImage(buffer: Buffer, mime: AllowedImageMime): SavedChatImage {
  if (buffer.length === 0) throw new ImageValidationError('圖片為空')
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new ImageValidationError(
      `圖片過大：${(buffer.length / 1024 / 1024).toFixed(1)}MB（上限 ${MAX_IMAGE_BYTES / 1024 / 1024}MB）`,
    )
  }
  const detected = detectKind(buffer)
  if (detected !== MIME_TO_KIND[mime]) {
    throw new ImageValidationError(`圖片內容與 mime 不符：聲明 ${mime}，實際 ${detected}`)
  }
  ensureDir(IMAGE_DIR)
  const ext = MIME_TO_EXT[mime]
  const filename = `${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}.${ext}`
  const absolutePath = path.join(IMAGE_DIR, filename)
  fs.writeFileSync(absolutePath, buffer)
  return {
    url: fileApiUrl(IMAGE_SUBDIR, filename),
    absolutePath,
    mime,
    size: buffer.length,
  }
}

export function resolveChatImagePath(url: string): string | null {
  const newPrefix = FILE_API_PREFIX + IMAGE_SUBDIR + '/'
  const legacyPrefix = '/uploads/chat-images/'
  let name: string | null = null
  if (url.startsWith(newPrefix)) name = url.slice(newPrefix.length)
  else if (url.startsWith(legacyPrefix)) name = url.slice(legacyPrefix.length)
  if (!name) return null
  try {
    name = decodeURIComponent(name)
  } catch {
    return null
  }
  if (!/^[\w.-]+$/.test(name)) return null
  return path.join(IMAGE_DIR, name)
}
