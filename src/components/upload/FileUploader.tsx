'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Upload, Loader2, CheckCircle } from 'lucide-react'

interface FileUploaderProps {
  type: 'transcript' | 'survey' | 'report'
  accept: string
}

const typeLabels = {
  transcript: '逐字稿',
  survey: '問卷 CSV',
  report: '研究報告（PDF / PPTX / DOCX / MD / TXT）',
}

interface UploadDuplicate {
  name: string
  existingTitle: string
  existingId: number
}
interface UploadRejected {
  name: string
  reason: string
}

export function FileUploader({ type, accept }: FileUploaderProps) {
  const [uploading, setUploading] = useState(false)
  const [done, setDone] = useState(false)
  const [duplicates, setDuplicates] = useState<UploadDuplicate[]>([])
  const [rejected, setRejected] = useState<UploadRejected[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files?.length) return

    setUploading(true)
    setDone(false)
    setDuplicates([])
    setRejected([])

    const formData = new FormData()
    for (const file of Array.from(files)) {
      formData.append('files', file)
    }
    formData.append('type', type)

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json().catch(() => ({})) as {
        uploaded?: number
        duplicates?: UploadDuplicate[]
        rejected?: UploadRejected[]
      }
      const dups = data.duplicates ?? []
      const rejs = data.rejected ?? []
      setDuplicates(dups)
      setRejected(rejs)
      if (res.ok && (data.uploaded ?? 0) > 0) {
        setDone(true)
        setTimeout(() => {
          setDone(false)
          router.refresh()
        }, 2000)
      } else if (dups.length > 0 || rejs.length > 0) {
        // skip success state, leave warnings visible
      }
    } catch (err) {
      console.error('Upload failed:', err)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <Card className="border-dashed">
      <CardContent className="py-6 flex flex-col items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple
          onChange={handleUpload}
          className="hidden"
          id={`upload-${type}`}
        />
        {done ? (
          <>
            <CheckCircle className="h-8 w-8 text-green-500" />
            <p className="text-sm text-green-600">上傳成功，處理中...</p>
          </>
        ) : (
          <>
            {uploading ? (
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            ) : (
              <Upload className="h-8 w-8 text-muted-foreground/50" />
            )}
            <p className="text-sm text-muted-foreground">
              {uploading ? '上傳中...' : `拖曳或點擊上傳${typeLabels[type]}檔案`}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              選擇檔案 ({accept})
            </Button>
          </>
        )}

        {duplicates.length > 0 && (
          <div className="w-full mt-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            <p className="font-medium mb-1">已存在相同內容（已跳過）：</p>
            <ul className="space-y-0.5">
              {duplicates.map(d => (
                <li key={d.existingId}>
                  · {d.name} ↔ <span className="font-mono">{d.existingTitle}</span>（id {d.existingId}）
                </li>
              ))}
            </ul>
          </div>
        )}
        {rejected.length > 0 && (
          <div className="w-full mt-2 rounded-md border border-red-300 bg-red-50 p-3 text-xs text-red-900">
            <p className="font-medium mb-1">驗證失敗：</p>
            <ul className="space-y-0.5">
              {rejected.map((r, i) => (
                <li key={i}>· {r.name}：{r.reason}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
