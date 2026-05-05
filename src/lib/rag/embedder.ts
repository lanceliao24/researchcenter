import { generateEmbeddings } from '@/lib/gemini'
import { chunkText } from './chunker'
import { createServiceClient } from '@/lib/supabase/server'

export async function embedDocument(
  documentId: number,
  text: string,
  sourceType: string,
  metadata?: Record<string, unknown>
) {
  const supabase = await createServiceClient()
  const chunks = chunkText(text)

  // Process in batches of 5
  const batchSize = 5
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize)
    const texts = batch.map((c) => c.text)
    const embeddings = await generateEmbeddings(texts)

    const rows = batch.map((chunk, j) => ({
      source_type: sourceType,
      source_id: documentId,
      chunk_text: chunk.text,
      chunk_index: chunk.index,
      embedding: JSON.stringify(embeddings[j]),
      metadata: metadata || null,
    }))

    await supabase.from('embeddings').insert(rows)
  }

  return chunks.length
}
