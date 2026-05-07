/**
 * Migrate `public/uploads/*` (web-public) to `data/store/*` and `data/files/*` (private).
 * Also rewrite `/uploads/...` URLs inside JSON stores to `/api/files/...`.
 *
 * Idempotent — re-running after a successful migration is a no-op (sources are gone).
 *
 * Run: npx tsx scripts/migrate-data.ts
 */
import fs from 'fs'
import path from 'path'

const ROOT = process.cwd()
const SRC = path.join(ROOT, 'public', 'uploads')
const DATA_ROOT = path.join(ROOT, 'data')
const STORE_DIR = path.join(DATA_ROOT, 'store')
const FILES_DIR = path.join(DATA_ROOT, 'files')

const STORE_RENAMES: Record<string, string> = {
  '_store.json': 'documents.json',
  '_personas.json': 'personas.json',
  '_persona_chats.json': 'persona-chats.json',
  '_persona_group_chats.json': 'persona-group-chats.json',
  '_persona_survey_fills.json': 'persona-survey-fills.json',
  '_ask_history.json': 'ask-history.json',
  '_quota.json': 'quota.json',
  '_survey_summaries.json': 'survey-summaries.json',
  '_dashboard_insights.json': 'dashboard-insights.json',
  '_monthly_report.json': 'monthly-report.json',
  '_monthly_survey_metrics.json': 'monthly-survey-metrics.json',
  '_topic_alignment.json': 'topic-alignment.json',
  '_social_store.json': 'social-store.json',
  '_vector_index.ndjson': 'vector-index.ndjson',
}

const FILE_SUBDIRS = [
  'report',
  'report-text',
  'survey',
  'survey-text',
  'survey-monthly',
  'transcript',
  'transcript-text',
  'chat-images',
]

function ensure(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function moveIfExists(src: string, dst: string) {
  if (!fs.existsSync(src)) return false
  if (fs.existsSync(dst)) {
    console.warn(`  skip — destination exists: ${dst}`)
    return false
  }
  ensure(path.dirname(dst))
  fs.renameSync(src, dst)
  return true
}

function rewriteUploadsToApi(value: unknown): unknown {
  if (typeof value === 'string') {
    if (value.startsWith('/uploads/')) {
      return '/api/files/' + value.slice('/uploads/'.length)
    }
    return value
  }
  if (Array.isArray(value)) return value.map(rewriteUploadsToApi)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = rewriteUploadsToApi(v)
    }
    return out
  }
  return value
}

function rewriteJsonFile(filePath: string) {
  if (!fs.existsSync(filePath)) return
  const raw = fs.readFileSync(filePath, 'utf-8')
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    console.warn(`  skip rewrite (invalid JSON): ${filePath}`)
    return
  }
  const next = rewriteUploadsToApi(json)
  fs.writeFileSync(filePath, JSON.stringify(next, null, 2))
}

function rewriteNdjsonFile(filePath: string) {
  if (!fs.existsSync(filePath)) return
  const raw = fs.readFileSync(filePath, 'utf-8')
  const lines = raw.split('\n')
  const out: string[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      out.push('')
      continue
    }
    try {
      const parsed = JSON.parse(trimmed)
      out.push(JSON.stringify(rewriteUploadsToApi(parsed)))
    } catch {
      out.push(line)
    }
  }
  fs.writeFileSync(filePath, out.join('\n'))
}

function main() {
  if (!fs.existsSync(SRC)) {
    console.log(`No source dir at ${SRC} — nothing to migrate.`)
    ensure(STORE_DIR)
    ensure(FILES_DIR)
    return
  }

  console.log('=== Migrating data: public/uploads/ → data/ ===')
  ensure(STORE_DIR)
  ensure(FILES_DIR)

  console.log('\n[1/3] Move JSON stores → data/store/')
  for (const [oldName, newName] of Object.entries(STORE_RENAMES)) {
    const src = path.join(SRC, oldName)
    const dst = path.join(STORE_DIR, newName)
    if (moveIfExists(src, dst)) console.log(`  ${oldName} → ${newName}`)
  }

  console.log('\n[2/3] Move file subdirs → data/files/')
  for (const sub of FILE_SUBDIRS) {
    const src = path.join(SRC, sub)
    const dst = path.join(FILES_DIR, sub)
    if (moveIfExists(src, dst)) console.log(`  ${sub}/`)
  }

  console.log('\n[3/3] Rewrite /uploads/* → /api/files/* in stores')
  const jsonStores = Object.values(STORE_RENAMES).filter(n => n.endsWith('.json'))
  for (const name of jsonStores) {
    const fp = path.join(STORE_DIR, name)
    if (fs.existsSync(fp)) {
      rewriteJsonFile(fp)
      console.log(`  rewrote ${name}`)
    }
  }
  const ndjson = path.join(STORE_DIR, 'vector-index.ndjson')
  if (fs.existsSync(ndjson)) {
    rewriteNdjsonFile(ndjson)
    console.log(`  rewrote vector-index.ndjson`)
  }

  // Leftovers in public/uploads/ root
  const remaining = fs.readdirSync(SRC).filter(n => !n.startsWith('.'))
  if (remaining.length > 0) {
    console.log(`\n⚠ Remaining items in ${SRC}:`)
    for (const n of remaining) console.log(`    ${n}`)
    console.log('  (Inspect and remove manually if expected.)')
  } else {
    console.log(`\n✓ ${SRC} is empty. You may delete it manually.`)
  }

  console.log('\nDone.')
}

main()
