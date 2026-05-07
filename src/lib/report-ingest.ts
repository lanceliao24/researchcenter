import { addLocalDocument, saveUploadedFile } from './local-store'
import { extractPptxText, enrichReport } from './report-enrich'
import { checkQuota, incrementQuota } from './quota'
import type { Document } from '@/types'

export async function ingestReportBuffer(
  buffer: Buffer,
  filename: string,
  mime = '',
  contentHash?: string,
): Promise<Document> {
  const relativePath = saveUploadedFile(buffer, filename, 'report')
  let metadata: Record<string, unknown> = { size: buffer.length, mime }
  if (contentHash) metadata.contentHash = contentHash
  let extractedText = ''

  const lower = filename.toLowerCase()
  if (lower.endsWith('.pdf')) {
    try {
      const pdfParse = (await import('pdf-parse') as {
        default: (buf: Buffer) => Promise<{ text: string; numpages: number }>
      }).default
      const pdfData = await pdfParse(buffer)
      extractedText = pdfData.text
      metadata = { ...metadata, pages: pdfData.numpages, textLength: extractedText.length }
      const txtName = filename.replace(/\.pdf$/i, '.txt')
      metadata.textPath = saveUploadedFile(
        Buffer.from(extractedText, 'utf-8'),
        txtName,
        'report-text',
      )
    } catch (err) {
      console.error('PDF parse error:', err)
      metadata.parseError = true
    }
  } else if (lower.endsWith('.pptx')) {
    try {
      const { slides, fullText } = await extractPptxText(buffer)
      extractedText = fullText
      metadata = { ...metadata, slides: slides.length, textLength: fullText.length }
      const txtName = filename.replace(/\.pptx$/i, '.txt')
      metadata.textPath = saveUploadedFile(
        Buffer.from(fullText, 'utf-8'),
        txtName,
        'report-text',
      )
      metadata.slidesPath = saveUploadedFile(
        Buffer.from(JSON.stringify(slides), 'utf-8'),
        filename.replace(/\.pptx$/i, '.slides.json'),
        'report-text',
      )
    } catch (err) {
      console.error('PPTX parse error:', err)
      metadata.parseError = true
    }
  }

  if (extractedText.trim().length > 50) {
    try {
      if (checkQuota('gemini_chat').ok) {
        const enrich = await enrichReport(filename, extractedText)
        incrementQuota('gemini_chat')
        metadata.category = enrich.category
        metadata.tags = enrich.tags
        metadata.summary = enrich.summary
      }
    } catch (err) {
      console.error('Report enrich error:', err)
      metadata.enrichError = (err as Error).message
    }
  }

  return addLocalDocument({
    title: filename,
    type: 'report',
    file_path: relativePath,
    status: 'ready',
    metadata,
    uploaded_by: 'local-user',
  })
}
