import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { filesPath, ensureDir, fileApiUrl, FILE_API_PREFIX } from './paths'

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

export function saveChatImage(buffer: Buffer, mime: AllowedImageMime): SavedChatImage {
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
