import { NextRequest, NextResponse } from 'next/server'
import { isLocalMode } from '@/lib/local-mode'
import { chat } from '@/lib/gemini'
import {
  readIndex,
  readSchema,
  writeWikiPage,
  writeIndex,
  appendLog,
  listWikiPages,
  readWikiPage,
  type WikiPageMeta,
} from '@/lib/wiki'
import { requireEditor } from '@/lib/auth'

export async function POST(request: NextRequest) {
  const auth = await requireEditor(request)
  if (auth instanceof NextResponse) return auth
  const { sourceId, sourceType, sourceTitle, sourceContent } = await request.json()

  if (!sourceContent || !sourceTitle) {
    return NextResponse.json({ error: 'Missing source content or title' }, { status: 400 })
  }

  const schema = readSchema()
  const index = readIndex()
  const existingPages = listWikiPages()

  // Build context of existing wiki pages for the LLM
  const existingPagesContext = existingPages.map(p => {
    const page = readWikiPage(p.slug)
    return `### ${p.slug}\n${page?.content?.substring(0, 500) || '(empty)'}`
  }).join('\n\n')

  const today = new Date().toISOString().slice(0, 10)
  const slugBase = sourceTitle
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50)

  const systemPrompt = `你是研究資料 Wiki 維護助手。你的任務是將一份新來源匯入 Wiki 知識庫。

## Wiki Schema
${schema}

## 現有 Wiki 頁面
${existingPagesContext || '（Wiki 目前為空）'}

## 現有 Index
${index}

## 指令

請根據以下來源資料，產生需要建立或更新的 Wiki 頁面。回覆格式必須嚴格遵循：

\`\`\`json
{
  "pages": [
    {
      "slug": "sources/${slugBase}",
      "meta": {
        "title": "來源標題",
        "type": "source",
        "sources": ["${sourceTitle}"],
        "tags": ["tag1", "tag2"],
        "created": "${today}",
        "updated": "${today}"
      },
      "content": "頁面 Markdown 內容..."
    }
  ],
  "updatedIndex": "更新後的完整 index.md 內容",
  "logEntry": "ingest | 一句話描述此次匯入"
}
\`\`\`

規則：
1. 一定要建立一個 sources/ 頁面
2. 如果內容涉及重要實體，建立或描述需要更新的 entities/ 頁面
3. 如果涉及特定主題，建立或描述需要更新的 topics/ 頁面
4. 使用 [[page-name]] 做交叉引用
5. 保持所有內容為繁體中文
6. 回覆必須是有效的 JSON（不含其他文字）`

  const userMessage = `## 來源資訊
- 標題：${sourceTitle}
- 類型：${sourceType}
- ID：${sourceId}

## 來源內容
${sourceContent.substring(0, 12000)}
${sourceContent.length > 12000 ? '\n\n（內容已截斷，以上為前 12000 字元）' : ''}`

  try {
    const response = await chat(systemPrompt, userMessage)

    // Extract JSON from response
    const jsonMatch = response.match(/```json\s*([\s\S]*?)```/) || response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'AI 回覆格式錯誤', raw: response }, { status: 500 })
    }

    const jsonStr = jsonMatch[1] || jsonMatch[0]
    const result = JSON.parse(jsonStr)

    // Write pages
    const writtenPages: string[] = []
    for (const page of result.pages || []) {
      writeWikiPage(page.slug, page.meta as WikiPageMeta, page.content)
      writtenPages.push(page.slug)
    }

    // Update index
    if (result.updatedIndex) {
      writeIndex(result.updatedIndex)
    }

    // Append log
    appendLog(result.logEntry || `ingest | ${sourceTitle}`)

    return NextResponse.json({
      success: true,
      pagesWritten: writtenPages,
      logEntry: result.logEntry,
    })
  } catch (err) {
    console.error('Wiki ingest error:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: `匯入失敗: ${message}` }, { status: 500 })
  }
}
