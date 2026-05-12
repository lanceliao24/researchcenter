import { redirect } from 'next/navigation'
import { isLocalMode } from '@/lib/local-mode'
import { mockDocuments } from '@/lib/mock-data'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FileUploader } from '@/components/upload/FileUploader'
import { getSessionFromCookies } from '@/lib/auth'
import type { Document } from '@/types'

export default async function InterviewsPage() {
  // Raw interview transcripts are editor-only sensitive data.
  const session = await getSessionFromCookies()
  if (!session) redirect('/login')
  if (session.role !== 'editor') redirect('/')

  let documents: Document[] = mockDocuments.filter(d => d.type === 'transcript')

  if (isLocalMode()) {
    const { getLocalDocuments } = await import('@/lib/local-store')
    const uploaded = getLocalDocuments('transcript')
    documents = [...uploaded, ...documents]
  } else {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    const { data } = await supabase
      .from('documents')
      .select('*')
      .eq('type', 'transcript')
      .order('created_at', { ascending: false })
    if (data) documents = data
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">訪談資料</h1>
          <p className="text-sm text-muted-foreground mt-1">
            共 {documents.length} 份逐字稿，AI 自動建立索引供問答使用
          </p>
        </div>
      </div>

      <FileUploader type="transcript" accept=".txt,.md,.docx" />

      <div className="grid gap-4">
        {documents.length > 0 ? (
          documents.map((doc) => (
            <Card key={doc.id}>
              <CardHeader className="flex flex-row items-center justify-between py-3">
                <CardTitle className="text-sm font-medium">{doc.title}</CardTitle>
                <Badge variant={doc.status === 'ready' ? 'default' : 'secondary'}>
                  {doc.status === 'ready' ? '已索引' : doc.status === 'processing' ? '處理中' : '錯誤'}
                </Badge>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-xs text-muted-foreground">
                  上傳時間：{new Date(doc.created_at).toLocaleString('zh-TW')}
                </p>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-sm text-muted-foreground">尚無訪談資料，請上傳逐字稿檔案</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
