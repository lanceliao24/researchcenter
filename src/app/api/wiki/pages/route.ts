import { NextRequest, NextResponse } from 'next/server'
import { listWikiPages, readWikiPage, readIndex, readLog } from '@/lib/wiki'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const slug = searchParams.get('slug')
  const view = searchParams.get('view') // 'index' | 'log'

  if (view === 'index') {
    return NextResponse.json({ content: readIndex() })
  }
  if (view === 'log') {
    return NextResponse.json({ content: readLog() })
  }

  if (slug) {
    const page = readWikiPage(slug)
    if (!page) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 })
    }
    return NextResponse.json({ page })
  }

  const pages = listWikiPages()
  return NextResponse.json({ pages })
}
