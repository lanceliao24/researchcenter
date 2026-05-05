import { generateEmbedding } from '@/lib/gemini'
import { createServiceClient } from '@/lib/supabase/server'

export interface RetrievedChunk {
  chunk_text: string
  source_type: string
  source_id: number
  metadata: Record<string, unknown> | null
  similarity: number
}

export async function retrieveContext(
  query: string,
  scope: string = 'all',
  topK: number = 8
): Promise<RetrievedChunk[]> {
  const supabase = await createServiceClient()
  const queryEmbedding = await generateEmbedding(query)

  // Use Supabase RPC for vector similarity search
  const { data, error } = await supabase.rpc('match_embeddings', {
    query_embedding: JSON.stringify(queryEmbedding),
    match_count: topK,
    filter_source_type: scope === 'all' ? null : scope,
  })

  if (error) {
    console.error('Vector search error:', error)
    return []
  }

  return data || []
}
