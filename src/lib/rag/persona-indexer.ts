import fs from 'fs'
import { upsertChunks, deleteBySource, type VectorRecordInput } from './local-semantic-retriever'
import { parseTranscript, groupBySpeaker } from '@/lib/transcript-parser'
import { getPersona, getPersonas } from '@/lib/persona-store'
import type { Persona } from '@/types'

export const PERSONA_QUOTE_MIN_CHARS = 15
export const PERSONA_QUOTE_MAX_CHARS = 500

export interface PersonaIndexResult {
  personaId: number
  speaker: string
  indexed: number
  skipped?: string
}

function chunkUtterance(text: string): string[] {
  if (text.length <= PERSONA_QUOTE_MAX_CHARS) return [text]
  const out: string[] = []
  let buf = ''
  const sentences = text.split(/(?<=[。！？!?])\s*/)
  for (const s of sentences) {
    if ((buf + s).length > PERSONA_QUOTE_MAX_CHARS && buf) {
      out.push(buf)
      buf = s
    } else {
      buf += s
    }
  }
  if (buf) out.push(buf)
  return out
}

function buildChunks(utterances: string[]): string[] {
  const chunks: string[] = []
  for (const raw of utterances) {
    const t = raw.trim()
    if (t.length < PERSONA_QUOTE_MIN_CHARS) continue
    chunks.push(...chunkUtterance(t))
  }
  return chunks
}

export async function indexPersonaQuotes(persona: Persona): Promise<PersonaIndexResult> {
  const filePath = persona.source?.file
  if (!filePath || !fs.existsSync(filePath)) {
    return {
      personaId: persona.id,
      speaker: persona.source?.speaker ?? '',
      indexed: 0,
      skipped: 'source transcript not accessible',
    }
  }

  let utterances: string[] = []
  try {
    const turns = parseTranscript(filePath)
    const profiles = groupBySpeaker(turns)
    const profile = profiles.find(p => p.speaker === persona.source.speaker)
    if (!profile) {
      return {
        personaId: persona.id,
        speaker: persona.source.speaker,
        indexed: 0,
        skipped: 'speaker not found in transcript',
      }
    }
    utterances = profile.utterances
  } catch (err) {
    return {
      personaId: persona.id,
      speaker: persona.source?.speaker ?? '',
      indexed: 0,
      skipped: `parse error: ${(err as Error).message}`,
    }
  }

  const chunks = buildChunks(utterances)
  if (chunks.length === 0) {
    return {
      personaId: persona.id,
      speaker: persona.source.speaker,
      indexed: 0,
      skipped: 'no chunks after filtering',
    }
  }

  // Wipe existing quotes for this persona, then upsert fresh
  deleteBySource('persona_quote', persona.id)

  const inputs: VectorRecordInput[] = chunks.map((text, i) => ({
    source_type: 'persona_quote',
    source_id: persona.id,
    chunk_index: i,
    text,
    metadata: {
      category: persona.category,
      speaker: persona.source.speaker,
      document_title: persona.name,
    },
  }))

  const indexed = await upsertChunks(inputs)
  return { personaId: persona.id, speaker: persona.source.speaker, indexed }
}

export function deletePersonaQuotes(personaId: number): number {
  return deleteBySource('persona_quote', personaId)
}

export async function reindexAllPersonas(): Promise<PersonaIndexResult[]> {
  const personas = getPersonas()
  const results: PersonaIndexResult[] = []
  for (const p of personas) {
    try {
      results.push(await indexPersonaQuotes(p))
    } catch (err) {
      results.push({
        personaId: p.id,
        speaker: p.source?.speaker ?? '',
        indexed: 0,
        skipped: `error: ${(err as Error).message}`,
      })
    }
  }
  return results
}

export async function reindexPersona(personaId: number): Promise<PersonaIndexResult> {
  const p = getPersona(personaId)
  if (!p) {
    return { personaId, speaker: '', indexed: 0, skipped: 'persona not found' }
  }
  return indexPersonaQuotes(p)
}
