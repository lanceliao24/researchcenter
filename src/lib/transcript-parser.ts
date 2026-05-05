import fs from 'fs'

export interface SpeakerTurn {
  speaker: string
  text: string
  timestamp: string
}

export interface SpeakerProfile {
  speaker: string
  utterances: string[]
  turnCount: number
  wordCount: number
  avgLen: number
  questionRatio: number
  sampleText: string
}

const TURN_HEAD = /^(\d{2}:\d{2}:\d{2})\s+(Speaker\s+\d+)\s*$/

export function parseTranscript(filePath: string): SpeakerTurn[] {
  const raw = fs.readFileSync(filePath, 'utf-8')
  const lines = raw.split(/\r?\n/)
  const turns: SpeakerTurn[] = []
  let i = 0
  while (i < lines.length) {
    const m = lines[i].match(TURN_HEAD)
    if (!m) { i++; continue }
    const [, timestamp, speaker] = m
    i++
    const buf: string[] = []
    while (i < lines.length && !TURN_HEAD.test(lines[i])) {
      if (lines[i].trim()) buf.push(lines[i].trim())
      i++
    }
    const text = buf.join(' ').trim()
    if (text) turns.push({ speaker, text, timestamp })
  }
  return turns
}

export function groupBySpeaker(turns: SpeakerTurn[]): SpeakerProfile[] {
  const map = new Map<string, string[]>()
  for (const t of turns) {
    if (!map.has(t.speaker)) map.set(t.speaker, [])
    map.get(t.speaker)!.push(t.text)
  }
  const profiles: SpeakerProfile[] = []
  for (const [speaker, utterances] of map.entries()) {
    const joined = utterances.join(' ')
    const wordCount = joined.replace(/\s+/g, '').length
    const questions = utterances.filter(u => /[？?]/.test(u)).length
    profiles.push({
      speaker,
      utterances,
      turnCount: utterances.length,
      wordCount,
      avgLen: wordCount / Math.max(1, utterances.length),
      questionRatio: questions / Math.max(1, utterances.length),
      sampleText: utterances.slice(0, 3).join(' ').slice(0, 200),
    })
  }
  profiles.sort((a, b) => b.wordCount - a.wordCount)
  return profiles
}

export function pickInterviewees(
  profiles: SpeakerProfile[],
  opts: { minTurns?: number; minWords?: number; maxQuestionRatio?: number } = {}
): SpeakerProfile[] {
  const {
    minTurns = 30,
    minWords = 500,
    maxQuestionRatio = 0.5,
  } = opts
  return profiles.filter(p =>
    p.turnCount >= minTurns &&
    p.wordCount >= minWords &&
    p.questionRatio <= maxQuestionRatio
  )
}

export function buildSpeakerDigest(profile: SpeakerProfile, maxChars = 8000): string {
  const joined = profile.utterances.join('\n')
  if (joined.length <= maxChars) return joined
  const step = Math.floor(joined.length / maxChars)
  const sampled: string[] = []
  let used = 0
  for (const u of profile.utterances) {
    if (used >= maxChars) break
    if (u.length < 10) continue
    sampled.push(u)
    used += u.length + 1
    if (step > 1 && Math.random() > 0.8) continue
  }
  return sampled.join('\n').slice(0, maxChars)
}
