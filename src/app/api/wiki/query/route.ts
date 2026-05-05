import { NextRequest, NextResponse } from 'next/server'
import { chat } from '@/lib/gemini'
import {
  readIndex,
  searchWikiPages,
  listWikiPages,
  readWikiPage,
  writeWikiPage,
  writeIndex,
  appendLog,
  type WikiPageMeta,
} from '@/lib/wiki'

export async function POST(request: NextRequest) {
  const { query, saveAsPage } = await request.json()

  if (!query) {
    return NextResponse.json({ error: 'Missing query' }, { status: 400 })
  }

  // Search wiki pages for relevant content
  const relevantPages = searchWikiPages(query, 8)
  const allPages = listWikiPages()
  const index = readIndex()

  const wikiContext = relevantPages.map(p =>
    `### [[${p.slug}]] — ${p.meta.title}\n${p.content}`
  ).join('\n\n---\n\n')

  const indexContext = `## Wiki Index\n${index}`

  const systemPrompt = `你是研究資料分析助手。你的知識來自一個持續維護的 Wiki 知識庫。

${indexContext}

## 相關 Wiki 頁面

${wikiContext || '（沒有找到相關頁面，Wiki 可能還是空的）'}

## 回答規則
1. 基於 Wiki 頁面內容回答，引用 [[page-slug]] 作為來源
2. 如果 Wiki 中沒有相關資訊，說明目前 Wiki 尚未收錄相關內容，建議匯入更多來源
3. 繁體中文回答
4. 結構化回答（條列、分段）
5. 如果問題需要跨多個頁面的綜合分析，進行交叉比較

回覆格式：
\`\`\`json
{
  "answer": "你的 Markdown 格式回答",
  "citedPages": ["被引用的頁面 slug 列表"],
  "suggestedFollowUps": ["建議的後續問題（1-3 個）"]
}
\`\`\`

只回覆 JSON，不含其他文字。`

  try {
    const response = await chat(systemPrompt, query)

    const jsonMatch = response.match(/```json\s*([\s\S]*?)```/) || response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({
        answer: response,
        citedPages: [],
        suggestedFollowUps: [],
      })
    }

    const jsonStr = jsonMatch[1] || jsonMatch[0]
    const result = JSON.parse(jsonStr)

    // Optionally save the answer as a new wiki page
    if (saveAsPage && result.answer) {
      const today = new Date().toISOString().slice(0, 10)
      const slug = `synthesis/query-${Date.now()}`
      const meta: WikiPageMeta = {
        title: query.substring(0, 60),
        type: 'synthesis',
        sources: result.citedPages || [],
        tags: ['query-result'],
        created: today,
        updated: today,
      }
      writeWikiPage(slug, meta, result.answer)
      appendLog(`query-save | ${query.substring(0, 50)}`)

      // Update index
      const currentIndex = readIndex()
      const synthSection = currentIndex.includes('## Synthesis')
        ? currentIndex.replace(
            /## Synthesis（綜合分析）\n\n/,
            `## Synthesis（綜合分析）\n\n- [${meta.title}](${slug}.md) — 查詢結果\n`
          )
        : currentIndex
      writeIndex(synthSection)

      result.savedAs = slug
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('Wiki query error:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: `查詢失敗: ${message}` }, { status: 500 })
  }
}
