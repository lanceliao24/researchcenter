import fs from 'fs'
import path from 'path'

const WIKI_DIR = path.join(process.cwd(), 'wiki')

export interface WikiPageMeta {
  title: string
  type: 'source' | 'entity' | 'topic' | 'synthesis'
  sources?: string[]
  tags?: string[]
  created: string
  updated: string
}

export interface WikiPage {
  slug: string        // e.g. "topics/pricing"
  filename: string    // e.g. "pricing.md"
  meta: WikiPageMeta
  content: string     // body without frontmatter
  raw: string         // full file content
}

export interface WikiPageSummary {
  slug: string
  title: string
  type: string
  updated: string
  tags?: string[]
}

// --- Read operations ---

export function listWikiPages(): WikiPageSummary[] {
  const pages: WikiPageSummary[] = []
  const dirs = ['sources', 'entities', 'topics', 'synthesis']

  for (const dir of dirs) {
    const dirPath = path.join(WIKI_DIR, dir)
    if (!fs.existsSync(dirPath)) continue

    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.md'))
    for (const file of files) {
      const raw = fs.readFileSync(path.join(dirPath, file), 'utf-8')
      const meta = parseFrontmatter(raw)
      pages.push({
        slug: `${dir}/${file.replace('.md', '')}`,
        title: meta?.title || file.replace('.md', ''),
        type: dir.replace(/s$/, ''),
        updated: meta?.updated || '',
        tags: meta?.tags,
      })
    }
  }

  return pages
}

export function readWikiPage(slug: string): WikiPage | null {
  const filePath = path.join(WIKI_DIR, `${slug}.md`)
  if (!fs.existsSync(filePath)) return null

  const raw = fs.readFileSync(filePath, 'utf-8')
  const meta = parseFrontmatter(raw)
  const content = stripFrontmatter(raw)
  const parts = slug.split('/')
  const filename = parts[parts.length - 1] + '.md'

  return {
    slug,
    filename,
    meta: meta || {
      title: filename.replace('.md', ''),
      type: (parts[0]?.replace(/s$/, '') as WikiPageMeta['type']) || 'topic',
      created: '',
      updated: '',
    },
    content,
    raw,
  }
}

export function readIndex(): string {
  const indexPath = path.join(WIKI_DIR, 'index.md')
  if (!fs.existsSync(indexPath)) return ''
  return fs.readFileSync(indexPath, 'utf-8')
}

export function readSchema(): string {
  const schemaPath = path.join(WIKI_DIR, 'SCHEMA.md')
  if (!fs.existsSync(schemaPath)) return ''
  return fs.readFileSync(schemaPath, 'utf-8')
}

export function readLog(): string {
  const logPath = path.join(WIKI_DIR, 'log.md')
  if (!fs.existsSync(logPath)) return ''
  return fs.readFileSync(logPath, 'utf-8')
}

// --- Write operations ---

export function writeWikiPage(slug: string, meta: WikiPageMeta, content: string) {
  const filePath = path.join(WIKI_DIR, `${slug}.md`)
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  const frontmatter = buildFrontmatter(meta)
  fs.writeFileSync(filePath, `${frontmatter}\n${content}`)
}

export function writeIndex(content: string) {
  fs.writeFileSync(path.join(WIKI_DIR, 'index.md'), content)
}

export function appendLog(entry: string) {
  const logPath = path.join(WIKI_DIR, 'log.md')
  const existing = fs.existsSync(logPath)
    ? fs.readFileSync(logPath, 'utf-8')
    : '# Wiki Log\n\n> 時序操作紀錄，由 AI 自動追加。\n\n---\n'

  const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ')
  const logEntry = `\n## [${timestamp}] ${entry}\n`
  fs.writeFileSync(logPath, existing + logEntry)
}

export function deleteWikiPage(slug: string): boolean {
  const filePath = path.join(WIKI_DIR, `${slug}.md`)
  if (!fs.existsSync(filePath)) return false
  fs.unlinkSync(filePath)
  return true
}

// --- Search ---

export function searchWikiPages(query: string, topK: number = 10): WikiPage[] {
  const pages = listWikiPages()
  const terms = query
    .toLowerCase()
    .replace(/[？?！!，,。.]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1)

  const scored: { page: WikiPage; score: number }[] = []

  for (const summary of pages) {
    const page = readWikiPage(summary.slug)
    if (!page) continue

    const text = (page.meta.title + ' ' + page.content + ' ' + (page.meta.tags?.join(' ') || '')).toLowerCase()
    let score = 0
    for (const term of terms) {
      if (text.includes(term)) {
        score += (text.match(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
      }
    }
    if (score > 0) scored.push({ page, score })
  }

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, topK).map(s => s.page)
}

// --- Frontmatter helpers ---

function parseFrontmatter(raw: string): WikiPageMeta | null {
  const match = raw.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return null

  const lines = match[1].split('\n')
  const obj: Record<string, unknown> = {}

  for (const line of lines) {
    const m = line.match(/^(\w+):\s*(.*)$/)
    if (!m) continue
    const [, key, val] = m
    if (val.startsWith('[') && val.endsWith(']')) {
      obj[key] = val.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, ''))
    } else {
      obj[key] = val.replace(/^["']|["']$/g, '')
    }
  }

  return {
    title: (obj.title as string) || '',
    type: (obj.type as WikiPageMeta['type']) || 'topic',
    sources: obj.sources as string[] | undefined,
    tags: obj.tags as string[] | undefined,
    created: (obj.created as string) || '',
    updated: (obj.updated as string) || '',
  }
}

function stripFrontmatter(raw: string): string {
  return raw.replace(/^---\n[\s\S]*?\n---\n*/, '').trim()
}

function buildFrontmatter(meta: WikiPageMeta): string {
  const lines = ['---']
  lines.push(`title: "${meta.title}"`)
  lines.push(`type: ${meta.type}`)
  if (meta.sources?.length) lines.push(`sources: [${meta.sources.map(s => `"${s}"`).join(', ')}]`)
  if (meta.tags?.length) lines.push(`tags: [${meta.tags.map(t => `"${t}"`).join(', ')}]`)
  lines.push(`created: ${meta.created}`)
  lines.push(`updated: ${meta.updated}`)
  lines.push('---')
  return lines.join('\n')
}
