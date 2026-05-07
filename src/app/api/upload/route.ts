import { NextRequest, NextResponse } from 'next/server'
import { isLocalMode } from '@/lib/local-mode'
import { validateUploadFile, type UploadType } from '@/lib/upload-validation'
import { requireEditor, type Session } from '@/lib/auth'
import { logAudit } from '@/lib/audit-log'

const VALID_TYPES: UploadType[] = ['report', 'survey', 'transcript']

export async function POST(request: NextRequest) {
  const auth = await requireEditor(request)
  if (auth instanceof NextResponse) return auth
  const formData = await request.formData()
  const files = formData.getAll('files') as File[]
  const type = formData.get('type') as string

  if (!files.length || !type) {
    return NextResponse.json({ error: 'Missing files or type' }, { status: 400 })
  }

  if (!VALID_TYPES.includes(type as UploadType)) {
    return NextResponse.json({ error: `不支援的 type: ${type}` }, { status: 400 })
  }

  if (isLocalMode()) {
    return handleLocalUpload(files, type as UploadType, auth)
  }

  return handleSupabaseUpload(request, files, type)
}

async function handleLocalUpload(files: File[], type: UploadType, session: Session) {
  const { addLocalDocument, saveUploadedFile } = await import('@/lib/local-store')
  const results: Array<unknown> = []
  const rejected: Array<{ name: string; reason: string }> = []

  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer())
    const validation = validateUploadFile(buffer, file.name, type)
    if (!validation.ok) {
      rejected.push({ name: file.name, reason: validation.reason })
      continue
    }

    if (type === 'report') {
      const { ingestReportBuffer } = await import('@/lib/report-ingest')
      const doc = await ingestReportBuffer(buffer, file.name, file.type)
      results.push(doc)
      continue
    }

    const relativePath = saveUploadedFile(buffer, file.name, type)
    let metadata: Record<string, unknown> = { size: file.size, mime: file.type }

    if (type === 'survey' && file.name.endsWith('.csv')) {
      const text = buffer.toString('utf-8')
      const lines = text.split('\n').filter(l => l.trim())
      const rows = Math.max(0, lines.length - 1)
      metadata = { ...metadata, rows }
    } else if (file.name.toLowerCase().endsWith('.pdf')) {
      try {
        const pdfParse = (await import('pdf-parse') as { default: (buf: Buffer) => Promise<{ text: string; numpages: number }> }).default
        const pdfData = await pdfParse(buffer)
        const extractedText = pdfData.text
        metadata = { ...metadata, pages: pdfData.numpages, textLength: extractedText.length }
        const txtName = file.name.replace(/\.pdf$/i, '.txt')
        metadata.textPath = saveUploadedFile(Buffer.from(extractedText, 'utf-8'), txtName, type + '-text')
      } catch (err) {
        console.error('PDF parse error:', err)
        metadata.parseError = true
      }
    }

    const doc = addLocalDocument({
      title: file.name,
      type: type,
      file_path: relativePath,
      status: 'ready',
      metadata,
      uploaded_by: 'local-user',
    })

    results.push(doc)
  }

  if (results.length > 0) {
    logAudit(session, 'upload.create', null, {
      type,
      count: results.length,
      titles: results.slice(0, 10).map(r => (r as { title?: string })?.title),
    })
  }

  const status = results.length === 0 && rejected.length > 0 ? 400 : 200
  return NextResponse.json(
    { uploaded: results.length, documents: results, rejected },
    { status },
  )
}

async function handleSupabaseUpload(_request: NextRequest, files: File[], type: string) {
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results = []

  for (const file of files) {
    const filePath = `${type}/${Date.now()}-${file.name}`
    const { error: uploadError } = await supabase.storage
      .from('research-files')
      .upload(filePath, file)

    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      continue
    }

    const { data: doc, error: docError } = await supabase
      .from('documents')
      .insert({
        title: file.name,
        type,
        file_path: filePath,
        status: 'processing',
        uploaded_by: user.id,
        metadata: { size: file.size, mime: file.type },
      })
      .select()
      .single()

    if (docError) {
      console.error('Document insert error:', docError)
      continue
    }

    results.push(doc)

    fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId: doc.id }),
    }).catch(console.error)
  }

  return NextResponse.json({ uploaded: results.length, documents: results })
}
