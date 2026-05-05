export interface Chunk {
  text: string
  index: number
}

export function chunkText(
  text: string,
  chunkSize = 500,
  overlap = 100
): Chunk[] {
  const chunks: Chunk[] = []

  // Split by paragraphs first for cleaner chunks
  const paragraphs = text.split(/\n\s*\n/)
  let buffer = ''
  let index = 0

  for (const para of paragraphs) {
    const trimmed = para.trim()
    if (!trimmed) continue

    if (buffer.length + trimmed.length > chunkSize && buffer.length > 0) {
      chunks.push({ text: buffer.trim(), index })
      // Keep overlap from the end of previous chunk
      const words = buffer.split(/\s+/)
      const overlapWords = words.slice(-Math.ceil(overlap / 5))
      buffer = overlapWords.join(' ') + ' ' + trimmed
      index++
    } else {
      buffer += (buffer ? '\n\n' : '') + trimmed
    }
  }

  if (buffer.trim()) {
    chunks.push({ text: buffer.trim(), index })
  }

  // If text has no paragraphs, fall back to character-based chunking
  if (chunks.length === 0 && text.trim()) {
    let i = 0
    let idx = 0
    while (i < text.length) {
      const end = Math.min(i + chunkSize, text.length)
      chunks.push({ text: text.slice(i, end).trim(), index: idx })
      i = end - overlap
      idx++
    }
  }

  return chunks
}
