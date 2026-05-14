import { NextRequest, NextResponse } from 'next/server'
import { isLocalMode } from '@/lib/local-mode'
import Papa from 'papaparse'

export async function GET(request: NextRequest) {
  const docId = request.nextUrl.searchParams.get('id')
  if (!docId) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  if (!isLocalMode()) {
    return NextResponse.json({ error: 'Not implemented for remote mode' }, { status: 501 })
  }

  const { getLocalDocuments, readUploadedFile } = await import('@/lib/local-store')
  const docs = getLocalDocuments()
  const doc = docs.find(d => d.id === Number(docId))

  if (!doc || !doc.file_path) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  try {
    const meta = doc.metadata as Record<string, unknown> | null
    const lowerName = doc.title.toLowerCase()

    if (doc.type === 'survey') {
      const textPath = meta?.textPath as string | undefined
      const content = readUploadedFile(textPath || doc.file_path)
      const parsed = Papa.parse(content, { header: true, skipEmptyLines: true })
      const headers = parsed.meta.fields || []
      const totalRows = parsed.data.length
      const preview = parsed.data.slice(0, 10) as Record<string, unknown>[]
      return NextResponse.json({ type: 'csv', headers, totalRows, preview })
    }

    if (lowerName.endsWith('.pdf')) {
      return NextResponse.json({
        type: 'pdf',
        url: doc.file_path,
        pages: meta?.pages ?? null,
      })
    }

    if (lowerName.endsWith('.pptx')) {
      const slidesPath = meta?.slidesPath as string | undefined
      if (slidesPath) {
        try {
          const slides = JSON.parse(readUploadedFile(slidesPath)) as string[]
          return NextResponse.json({ type: 'pptx', slides, totalSlides: slides.length })
        } catch (err) {
          console.error('Failed to load slides json:', err)
        }
      }
      const textPath = meta?.textPath as string | undefined
      if (textPath) {
        const content = readUploadedFile(textPath)
        return NextResponse.json({ type: 'pptx', slides: [content], totalSlides: 1 })
      }
      return NextResponse.json({ error: 'PPTX 無可預覽內容' }, { status: 404 })
    }

    const textPath = meta?.textPath as string | undefined
    const filePath = textPath || doc.file_path
    const content = readUploadedFile(filePath)
    return NextResponse.json({
      type: 'text',
      content: content.substring(0, 2000),
      totalLength: content.length,
    })
  } catch (err) {
    console.error('Preview error:', err)
    return NextResponse.json({ error: 'Failed to read file' }, { status: 500 })
  }
}
