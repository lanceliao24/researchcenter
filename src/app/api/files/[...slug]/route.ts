import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { resolveRelativeFilePath } from '@/lib/paths'

const MIME_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.yml': 'text/yaml; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await params
  if (!slug || slug.length === 0) {
    return NextResponse.json({ error: 'Missing path' }, { status: 400 })
  }

  const absolute = resolveRelativeFilePath(slug.join('/'))
  if (!absolute) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const ext = path.extname(absolute).toLowerCase()
  const mime = MIME_BY_EXT[ext] || 'application/octet-stream'
  const buf = fs.readFileSync(absolute)
  return new NextResponse(buf as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Content-Length': String(buf.length),
      'Cache-Control': 'private, max-age=300',
    },
  })
}
