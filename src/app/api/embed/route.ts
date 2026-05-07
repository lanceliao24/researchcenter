import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { embedDocument } from '@/lib/rag/embedder'
import { requireEditor } from '@/lib/auth'
import Papa from 'papaparse'

export async function POST(request: NextRequest) {
  const auth = await requireEditor(request)
  if (auth instanceof NextResponse) return auth
  const { documentId } = await request.json()

  if (!documentId) {
    return NextResponse.json({ error: 'Missing documentId' }, { status: 400 })
  }

  const supabase = await createServiceClient()

  const { data: doc } = await supabase
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .single()

  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  try {
    // Download file from storage
    const { data: fileData } = await supabase.storage
      .from('research-files')
      .download(doc.file_path)

    if (!fileData) {
      throw new Error('Failed to download file')
    }

    let text = ''

    if (doc.type === 'survey') {
      // Parse CSV and create summary + store rows
      const csvText = await fileData.text()
      const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true })

      // Store individual rows
      const rows = parsed.data.map((row) => ({
        document_id: doc.id,
        row_data: row,
      }))

      // Insert in batches
      const batchSize = 100
      for (let i = 0; i < rows.length; i += batchSize) {
        await supabase
          .from('survey_responses')
          .insert(rows.slice(i, i + batchSize))
      }

      // Generate text summary for embedding
      const headers = parsed.meta.fields || []
      const rowCount = parsed.data.length
      text = `問卷資料摘要：${doc.title}\n欄位：${headers.join(', ')}\n共 ${rowCount} 筆回覆\n\n`

      // Add sample rows for context
      const sampleRows = parsed.data.slice(0, 10)
      text += '前 10 筆資料：\n'
      for (const row of sampleRows) {
        const r = row as Record<string, unknown>
        text += Object.entries(r).map(([k, v]) => `${k}: ${v}`).join(' | ') + '\n'
      }
    } else {
      // Text-based documents (transcript, report)
      text = await fileData.text()
    }

    if (!text.trim()) {
      throw new Error('Empty document content')
    }

    // Generate embeddings
    const chunkCount = await embedDocument(
      doc.id,
      text,
      doc.type === 'survey' ? 'survey_summary' : 'document',
      { title: doc.title, type: doc.type }
    )

    // Mark document as ready
    await supabase
      .from('documents')
      .update({ status: 'ready' })
      .eq('id', doc.id)

    return NextResponse.json({ success: true, chunks: chunkCount })
  } catch (err) {
    console.error('Embed error:', err)

    await supabase
      .from('documents')
      .update({ status: 'error' })
      .eq('id', doc.id)

    return NextResponse.json({ error: 'Embedding failed' }, { status: 500 })
  }
}
