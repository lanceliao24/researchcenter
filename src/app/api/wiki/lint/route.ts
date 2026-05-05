import { NextResponse } from 'next/server'
import { chat } from '@/lib/gemini'
import { listWikiPages, readWikiPage, readIndex, appendLog } from '@/lib/wiki'

export async function POST() {
  const pages = listWikiPages()

  if (pages.length === 0) {
    return NextResponse.json({
      issues: [],
      suggestions: ['Wiki 目前為空，請先匯入一些研究資料來源'],
      summary: 'Wiki 尚未建立任何頁面，建議從匯入來源開始。',
    })
  }

  // Gather all wiki content
  const allContent = pages.map(p => {
    const page = readWikiPage(p.slug)
    return `### ${p.slug} (${p.title})\n${page?.content?.substring(0, 800) || ''}`
  }).join('\n\n---\n\n')

  const index = readIndex()

  // Collect all cross-references
  const allRefs = new Set<string>()
  const allSlugs = new Set(pages.map(p => p.slug))
  for (const p of pages) {
    const page = readWikiPage(p.slug)
    if (!page) continue
    const refs = page.content.match(/\[\[([^\]]+)\]\]/g) || []
    for (const ref of refs) {
      allRefs.add(ref.slice(2, -2))
    }
  }

  // Find broken references
  const brokenRefs = [...allRefs].filter(ref => !allSlugs.has(ref))

  // Find orphan pages (no inbound references)
  const referencedSlugs = new Set(allRefs)
  const orphans = pages.filter(p => !referencedSlugs.has(p.slug) && p.type !== 'source')

  const systemPrompt = `你是 Wiki 健康檢查助手。分析以下 Wiki 頁面，找出問題和改善建議。

## Wiki 頁面

${allContent}

## Index

${index}

## 已知問題
- 失效引用：${brokenRefs.length > 0 ? brokenRefs.join(', ') : '無'}
- 孤立頁面：${orphans.length > 0 ? orphans.map(p => p.slug).join(', ') : '無'}

請分析並回覆 JSON：
\`\`\`json
{
  "issues": [
    {"type": "contradiction|stale|missing_page|missing_ref|orphan", "description": "描述", "pages": ["相關頁面"]}
  ],
  "suggestions": ["改善建議（具體且可執行）"],
  "summary": "一段話總結 Wiki 目前狀態"
}
\`\`\`

只回覆 JSON。`

  try {
    const response = await chat(systemPrompt, '請進行 Wiki 健康檢查')

    const jsonMatch = response.match(/```json\s*([\s\S]*?)```/) || response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({
        issues: brokenRefs.map(r => ({
          type: 'missing_page',
          description: `引用的頁面 [[${r}]] 不存在`,
          pages: [],
        })),
        suggestions: ['建議檢查並修復失效引用'],
        summary: `Wiki 共 ${pages.length} 頁，${brokenRefs.length} 個失效引用。`,
      })
    }

    const result = JSON.parse(jsonMatch[1] || jsonMatch[0])

    // Add local checks
    for (const ref of brokenRefs) {
      if (!result.issues.some((i: { description: string }) => i.description.includes(ref))) {
        result.issues.push({
          type: 'missing_page',
          description: `引用 [[${ref}]] 的頁面不存在`,
          pages: [],
        })
      }
    }

    appendLog(`lint | ${result.issues.length} issues, ${pages.length} pages`)

    return NextResponse.json(result)
  } catch (err) {
    console.error('Wiki lint error:', err)

    // Return local-only checks if AI fails
    return NextResponse.json({
      issues: [
        ...brokenRefs.map(r => ({
          type: 'missing_page' as const,
          description: `引用 [[${r}]] 的頁面不存在`,
          pages: [],
        })),
        ...orphans.map(p => ({
          type: 'orphan' as const,
          description: `頁面 ${p.slug} 沒有被任何其他頁面引用`,
          pages: [p.slug],
        })),
      ],
      suggestions: ['設定 Gemini API Key 以啟用 AI 分析'],
      summary: `Wiki 共 ${pages.length} 頁。基礎檢查完成（AI 分析不可用）。`,
    })
  }
}
