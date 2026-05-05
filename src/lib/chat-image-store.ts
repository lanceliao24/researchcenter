import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const IMAGE_DIR = path.join(process.cwd(), 'public', 'uploads', 'chat-images')

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
  if (!fs.existsSync(IMAGE_DIR)) fs.mkdirSync(IMAGE_DIR, { recursive: true })
  const ext = MIME_TO_EXT[mime]
  const filename = `${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}.${ext}`
  const absolutePath = path.join(IMAGE_DIR, filename)
  fs.writeFileSync(absolutePath, buffer)
  return {
    url: `/uploads/chat-images/${filename}`,
    absolutePath,
    mime,
    size: buffer.length,
  }
}

export function resolveChatImagePath(url: string): string | null {
  const prefix = '/uploads/chat-images/'
  if (!url.startsWith(prefix)) return null
  const name = url.slice(prefix.length)
  if (!/^[\w.-]+$/.test(name)) return null
  return path.join(IMAGE_DIR, name)
}
