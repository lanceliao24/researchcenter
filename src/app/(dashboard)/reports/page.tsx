import { isLocalMode } from '@/lib/local-mode'
import { mockDocuments } from '@/lib/mock-data'
import { FileUploader } from '@/components/upload/FileUploader'
import type { Document } from '@/types'
import { ReportList } from './report-list'

export default async function ReportsPage() {
  let documents: Document[] = mockDocuments.filter(d => d.type === 'report')

  if (isLocalMode()) {
    const { getLocalDocuments } = await import('@/lib/local-store')
    const uploaded = getLocalDocuments('report')
    documents = [...uploaded, ...documents]
  } else {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    const { data } = await supabase
      .from('documents')
      .select('*')
      .eq('type', 'report')
      .order('created_at', { ascending: false })
    if (data) documents = data
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">報告中心</h1>
        <p className="text-sm text-muted-foreground mt-1">
          共 {documents.length} 份報告 · 上傳後 AI 自動分類、產生標籤與摘要
        </p>
      </div>

      <FileUploader type="report" accept=".pdf,.pptx,.docx,.md,.txt" />

      <ReportList documents={documents} isLocal={isLocalMode()} />
    </div>
  )
}
