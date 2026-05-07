import { NextRequest, NextResponse } from 'next/server'
import { isLocalMode } from '@/lib/local-mode'
import { validateUploadFile } from '@/lib/upload-validation'
import { requireEditor } from '@/lib/auth'

const FILE_ID_PATTERNS = [
  /\/file\/d\/([a-zA-Z0-9_-]+)/,
  /\/document\/d\/([a-zA-Z0-9_-]+)/,
  /\/presentation\/d\/([a-zA-Z0-9_-]+)/,
  /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/,
  /\/drive\/folders\/([a-zA-Z0-9_-]+)/,
  /[?&]id=([a-zA-Z0-9_-]+)/,
]

function extractFileId(input: string): string | null {
  const trimmed = input.trim()
  for (const p of FILE_ID_PATTERNS) {
    const m = trimmed.match(p)
    if (m) return m[1]
  }
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed
  return null
}

const GOOGLE_NATIVE_EXPORT: Record<string, { ext: string; mime: string }> = {
  'application/vnd.google-apps.document': { ext: '.pdf', mime: 'application/pdf' },
  'application/vnd.google-apps.presentation': { ext: '.pdf', mime: 'application/pdf' },
  'application/vnd.google-apps.drawing': { ext: '.pdf', mime: 'application/pdf' },
}

interface DriveMeta {
  name?: string
  mimeType?: string
  size?: string
}

async function fetchDriveFile(
  fileId: string,
  apiKey: string,
): Promise<{ buffer: Buffer; name: string; mime: string }> {
  const metaUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType,size&key=${apiKey}`
  const metaRes = await fetch(metaUrl)
  if (!metaRes.ok) {
    const text = await metaRes.text().catch(() => '')
    throw new Error(`取得檔案資訊失敗 (${metaRes.status}): ${text.slice(0, 120)}`)
  }
  const meta = (await metaRes.json()) as DriveMeta
  const name = meta.name ?? fileId
  const mimeType = meta.mimeType ?? 'application/octet-stream'

  const native = GOOGLE_NATIVE_EXPORT[mimeType]
  let downloadUrl: string
  let outputMime: string
  let outputName: string

  if (native) {
    downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(native.mime)}&key=${apiKey}`
    outputMime = native.mime
    outputName = name.toLowerCase().endsWith(native.ext) ? name : name + native.ext
  } else {
    downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${apiKey}`
    outputMime = mimeType
    outputName = name
  }

  const dlRes = await fetch(downloadUrl)
  if (!dlRes.ok) {
    const text = await dlRes.text().catch(() => '')
    throw new Error(`下載失敗 (${dlRes.status}): ${text.slice(0, 120)}`)
  }
  const ab = await dlRes.arrayBuffer()
  return { buffer: Buffer.from(ab), name: outputName, mime: outputMime }
}

export async function POST(request: NextRequest) {
  const auth = await requireEditor(request)
  if (auth instanceof NextResponse) return auth
  if (!isLocalMode()) {
    return NextResponse.json({ error: 'Not implemented for remote mode' }, { status: 501 })
  }

  const apiKey = process.env.GOOGLE_DRIVE_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: '尚未設定 GOOGLE_DRIVE_API_KEY，請到 .env.local 加入' },
      { status: 500 },
    )
  }

  const body = await request.json().catch(() => ({}))
  const urls: string[] = Array.isArray(body.urls)
    ? body.urls.map((u: unknown) => String(u)).filter(Boolean)
    : []
  if (urls.length === 0) {
    return NextResponse.json({ error: '請提供至少一個 Drive 連結' }, { status: 400 })
  }

  const { ingestReportBuffer } = await import('@/lib/report-ingest')

  const results: Array<{
    url: string
    ok: boolean
    doc?: { id: number; title: string }
    error?: string
  }> = []

  for (const url of urls) {
    const fileId = extractFileId(url)
    if (!fileId) {
      results.push({ url, ok: false, error: '無法從連結解析出 file id' })
      continue
    }
    try {
      const { buffer, name, mime } = await fetchDriveFile(fileId, apiKey)
      const v = validateUploadFile(buffer, name, 'report')
      if (!v.ok) {
        results.push({ url, ok: false, error: `驗證失敗：${v.reason}` })
        continue
      }
      const doc = await ingestReportBuffer(buffer, name, mime)
      results.push({ url, ok: true, doc: { id: doc.id, title: doc.title } })
    } catch (err) {
      results.push({ url, ok: false, error: (err as Error).message })
    }
  }

  const successCount = results.filter(r => r.ok).length
  return NextResponse.json({ imported: successCount, total: urls.length, results })
}
