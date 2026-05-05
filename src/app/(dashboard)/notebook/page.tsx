import { isLocalMode } from '@/lib/local-mode'
import { mockDocuments, mockSocialPosts } from '@/lib/mock-data'
import { listWikiPages } from '@/lib/wiki'
import type { Document } from '@/types'
import { NotebookClient } from './notebook-client'

export default async function NotebookPage() {
  // Gather available sources for ingest
  let documents: Document[] = [...mockDocuments]

  if (isLocalMode()) {
    const { getLocalDocuments } = await import('@/lib/local-store')
    const uploaded = getLocalDocuments()
    documents = [...uploaded, ...documents]
  } else {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    const { data } = await supabase
      .from('documents')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) documents = data
  }

  const wikiPages = listWikiPages()
  const socialPostCount = mockSocialPosts.length

  return (
    <NotebookClient
      documents={documents}
      wikiPages={wikiPages}
      socialPostCount={socialPostCount}
    />
  )
}
