import fs from 'fs'
import path from 'path'
import Papa from 'papaparse'
import { getLocalDocuments } from '@/lib/local-store'
import { mockSocialPosts } from '@/lib/mock-data'

export interface LocalChunk {
  chunk_text: string
  source_type: string
  source_id: number
  title: string
}

/**
 * Local mode retriever: reads uploaded files + mock data,
 * performs keyword-based relevance matching.
 */
export function retrieveLocalContext(
  query: string,
  scope: string = 'all',
  topK: number = 8
): LocalChunk[] {
  const chunks: LocalChunk[] = []

  // 1. Social posts (from mock data)
  if (scope === 'all' || scope === 'social') {
    for (const post of mockSocialPosts) {
      const text = `[${post.platform}] ${post.title || ''}\n${post.description || ''}\n關鍵字: ${post.keyword}\n情緒: ${post.sentiment || '未分析'}`
      chunks.push({
        chunk_text: text,
        source_type: 'social_post',
        source_id: post.id,
        title: post.title || post.url,
      })
    }
  }

  // 2. Uploaded documents
  const localDocs = getLocalDocuments()
  for (const doc of localDocs) {
    if (scope !== 'all') {
      if (scope === 'transcript' && doc.type !== 'transcript') continue
      if (scope === 'survey' && doc.type !== 'survey') continue
      if (scope === 'report' && doc.type !== 'report') continue
    }

    if (!doc.file_path) continue

    try {
      // For PDFs, read the extracted text file instead
      const meta = doc.metadata as Record<string, unknown> | null
      const textPath = meta?.textPath as string | undefined
      const filePath = textPath || doc.file_path
      const fullPath = path.join(process.cwd(), 'public', filePath)
      if (!fs.existsSync(fullPath)) continue
      const content = fs.readFileSync(fullPath, 'utf-8')

      if (doc.type === 'survey') {
        // Parse CSV and create a summary
        const parsed = Papa.parse(content, { header: true, skipEmptyLines: true })
        const headers = parsed.meta.fields || []
        const rows = parsed.data as Record<string, unknown>[]
        const totalRows = rows.length

        // Summary chunk
        chunks.push({
          chunk_text: `問卷資料：${doc.title}\n共 ${totalRows} 筆回覆\n欄位：${headers.join('、')}`,
          source_type: 'survey_summary',
          source_id: doc.id,
          title: doc.title,
        })

        // Sample open-ended responses (columns with text content)
        const textColumns = headers.filter(h => {
          // Find columns that contain text responses (longer answers)
          const sampleValues = rows.slice(0, 50).map(r => String(r[h] || ''))
          const avgLen = sampleValues.reduce((s, v) => s + v.length, 0) / sampleValues.length
          return avgLen > 15 // likely open-ended if average > 15 chars
        })

        for (const col of textColumns.slice(0, 10)) {
          const responses = rows
            .map(r => String(r[col] || '').trim())
            .filter(v => v.length > 5)
            .slice(0, 20)

          if (responses.length > 0) {
            chunks.push({
              chunk_text: `問卷題目：${col}\n\n回覆摘錄（共 ${responses.length} 則）：\n${responses.map((r, i) => `${i + 1}. ${r}`).join('\n')}`,
              source_type: 'survey_summary',
              source_id: doc.id,
              title: `${doc.title} - ${col.substring(0, 40)}`,
            })
          }
        }

        // Numeric summary for rating columns
        const ratingColumns = headers.filter(h => {
          const vals = rows.slice(0, 100).map(r => String(r[h] || ''))
          const numericCount = vals.filter(v => /^[1-5]分?$/.test(v.trim())).length
          return numericCount > vals.length * 0.3
        })

        if (ratingColumns.length > 0) {
          const summaryLines: string[] = []
          for (const col of ratingColumns.slice(0, 8)) {
            const vals = rows.map(r => {
              const v = String(r[col] || '').trim()
              const m = v.match(/^(\d)/)
              return m ? Number(m[1]) : null
            }).filter((v): v is number => v !== null)

            if (vals.length > 0) {
              const avg = (vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(1)
              summaryLines.push(`${col.substring(0, 50)}: 平均 ${avg} 分 (${vals.length} 人)`)
            }
          }
          if (summaryLines.length > 0) {
            chunks.push({
              chunk_text: `問卷評分統計（${doc.title}）：\n${summaryLines.join('\n')}`,
              source_type: 'survey_summary',
              source_id: doc.id,
              title: `${doc.title} - 評分統計`,
            })
          }
        }
      } else {
        // Text documents (transcript, report) - chunk by paragraphs
        const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 20)
        const chunkSize = 800
        let buffer = ''

        for (const para of paragraphs) {
          if (buffer.length + para.length > chunkSize && buffer) {
            chunks.push({
              chunk_text: buffer.trim(),
              source_type: 'document',
              source_id: doc.id,
              title: doc.title,
            })
            buffer = para
          } else {
            buffer += (buffer ? '\n\n' : '') + para
          }
        }
        if (buffer.trim()) {
          chunks.push({
            chunk_text: buffer.trim(),
            source_type: 'document',
            source_id: doc.id,
            title: doc.title,
          })
        }
      }
    } catch (err) {
      console.error(`Error reading document ${doc.id}:`, err)
    }
  }

  // 3. Score chunks by keyword relevance
  const queryTerms = query
    .toLowerCase()
    .replace(/[？?！!，,。.]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1)

  const scored = chunks.map(chunk => {
    const text = chunk.chunk_text.toLowerCase()
    let score = 0
    for (const term of queryTerms) {
      if (text.includes(term)) {
        score += (text.match(new RegExp(term, 'g')) || []).length
      }
    }
    return { chunk, score }
  })

  scored.sort((a, b) => b.score - a.score)

  return scored
    .filter(s => s.score > 0)
    .slice(0, topK)
    .map(s => s.chunk)
}
