import fs from 'fs'
import path from 'path'
import type { Document } from '@/types'

const STORE_PATH = path.join(process.cwd(), 'public', 'uploads', '_store.json')

interface LocalStore {
  documents: Document[]
  nextId: number
}

function readStore(): LocalStore {
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return { documents: [], nextId: 100 }
  }
}

function writeStore(store: LocalStore) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2))
}

export function getLocalDocuments(type?: string): Document[] {
  const store = readStore()
  if (type) return store.documents.filter(d => d.type === type)
  return store.documents
}

export function addLocalDocument(doc: Omit<Document, 'id' | 'created_at'>): Document {
  const store = readStore()
  const newDoc: Document = {
    ...doc,
    id: store.nextId++,
    created_at: new Date().toISOString(),
  }
  store.documents.unshift(newDoc)
  writeStore(store)
  return newDoc
}

export function updateLocalDocumentStatus(id: number, status: Document['status']) {
  const store = readStore()
  const doc = store.documents.find(d => d.id === id)
  if (doc) {
    doc.status = status
    writeStore(store)
  }
}

export function updateLocalDocumentMetadata(
  id: number,
  patch: Record<string, unknown>,
): Document | null {
  const store = readStore()
  const doc = store.documents.find(d => d.id === id)
  if (!doc) return null
  const current = (doc.metadata ?? {}) as Record<string, unknown>
  doc.metadata = { ...current, ...patch }
  writeStore(store)
  return doc
}

export function removeLocalDocument(id: number): Document | null {
  const store = readStore()
  const idx = store.documents.findIndex(d => d.id === id)
  if (idx < 0) return null
  const [doc] = store.documents.splice(idx, 1)
  writeStore(store)

  const pathsToDelete: string[] = []
  if (doc.file_path) pathsToDelete.push(doc.file_path)
  const meta = doc.metadata as Record<string, unknown> | null
  const textPath = meta?.textPath
  if (typeof textPath === 'string') pathsToDelete.push(textPath)

  for (const rel of pathsToDelete) {
    try {
      const full = path.join(process.cwd(), 'public', rel)
      if (fs.existsSync(full)) fs.unlinkSync(full)
    } catch (err) {
      console.error('Failed to delete file', rel, err)
    }
  }

  return doc
}

export function saveUploadedFile(file: Buffer, filename: string, subdir: string): string {
  const dir = path.join(process.cwd(), 'public', 'uploads', subdir)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const safeName = `${Date.now()}-${filename}`
  const filePath = path.join(dir, safeName)
  fs.writeFileSync(filePath, file)
  return `/uploads/${subdir}/${safeName}`
}

export function readUploadedFile(relativePath: string): string {
  const fullPath = path.join(process.cwd(), 'public', relativePath)
  return fs.readFileSync(fullPath, 'utf-8')
}
