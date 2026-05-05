import { Suspense } from 'react'
import { AskClient } from './ask-client'

export default function AskPage() {
  return (
    <Suspense fallback={<div className="text-sm text-muted-foreground">載入中...</div>}>
      <AskClient />
    </Suspense>
  )
}
