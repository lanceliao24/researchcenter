export type UserRole = 'admin' | 'viewer'

export interface Profile {
  id: string
  email: string
  name: string | null
  role: UserRole
  created_at: string
}

export interface SocialPost {
  id: number
  keyword: string
  platform: string
  title: string | null
  url: string
  description: string | null
  sentiment: 'positive' | 'neutral' | 'negative' | null
  fetched_at: string
  published_at: string | null
}

export interface Keyword {
  id: number
  keyword: string
  is_active: boolean
  created_at: string
}

export interface Document {
  id: number
  title: string
  type: 'transcript' | 'survey' | 'report'
  file_path: string | null
  status: 'processing' | 'ready' | 'error'
  metadata: Record<string, unknown> | null
  uploaded_by: string | null
  created_at: string
}

export interface SurveyResponse {
  id: number
  document_id: number
  row_data: Record<string, unknown>
  created_at: string
}

export interface Embedding {
  id: number
  source_type: 'social_post' | 'document' | 'survey_summary'
  source_id: number
  chunk_text: string
  chunk_index: number
  metadata: Record<string, unknown> | null
  created_at: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  sources?: {
    type: string
    title: string
    url?: string
    snippet: string
  }[]
}

export type PersonaCategory = '共享汽車' | '計程車' | '共享機車' | '其他'

export const PERSONA_CATEGORIES: PersonaCategory[] = ['共享汽車', '計程車', '共享機車', '其他']

export const SURVEY_SERVICE_KEYS = [
  'taxi',
  'rental',
  'station_rental',
  'shuttle',
  'designated_driver',
  'group',
  'chauffeured_car',
  'scooter',
  'charging',
] as const

export type SurveyServiceKey = (typeof SURVEY_SERVICE_KEYS)[number]

export const SURVEY_SERVICE_LABELS: Record<SurveyServiceKey, string> = {
  taxi: '計程車',
  rental: '共享汽車',
  station_rental: '門市日租',
  shuttle: '機場接送',
  designated_driver: '代駕',
  group: '揪團',
  chauffeured_car: '包車',
  scooter: '共享機車',
  charging: '充電站',
}

export function surveyServiceLabel(key: string): string {
  return (SURVEY_SERVICE_LABELS as Record<string, string>)[key] ?? key
}

export interface SurveyMonthlyRawRow {
  id: number
  uid: number
  service: string
  order_id: string
  nps: number
  satisfaction: number
  suggestion: string[]
  other_suggestion: string[]
  complaints: string[]
  other_complaints: string[]
  created_at: string
  completed_at: string
  updated_at: string
}

export interface SurveyOptionDist {
  label: string
  count: number
  pct: number
}

export interface SurveyTheme {
  label: string
  count: number
  examples: string[]
}

export interface SurveyMonthlyMetrics {
  month: string
  service: string
  responses: number
  weight_pct: number
  satisfied_pct: number
  satisfaction_avg: number
  nps: number
  promoters: number
  passives: number
  detractors: number
  satisfaction_dist: Record<string, number>
  nps_dist: Record<string, number>
  suggestion_dist: SurveyOptionDist[]
  complaint_dist: SurveyOptionDist[]
  themes?: {
    suggestion?: SurveyTheme[]
    complaint?: SurveyTheme[]
  }
  themes_updated_at?: string
  computed_at: string
}

export interface SurveyMonthlyImportResult {
  imported_months: string[]
  affected: Record<string, Record<string, number>>
  total_rows: number
  skipped: number
}

export interface Persona {
  id: number
  name: string
  category: PersonaCategory
  age_range: string
  gender: string
  occupation: string
  location: string
  summary: string
  background: string
  goals: string[]
  pain_points: string[]
  behaviors: string[]
  service_preferences: string[]
  quotes: string[]
  source: {
    file: string
    speaker: string
    utterance_count: number
  }
  tags: string[]
  transcript_digest: string
  created_at: string
}

export interface PersonaChatMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  images?: string[]
  created_at: string
}

export interface ABTestOptionAssessment {
  reaction: string
  likert: 1 | 2 | 3 | 4 | 5
  score: number
  similarities: number[]
}

export type ABTestWinner = 'A' | 'B' | 'tie'

export interface ABTestResponse {
  personaId: number
  personaName: string
  A?: ABTestOptionAssessment
  B?: ABTestOptionAssessment
  diff?: number
  winner?: ABTestWinner
  error?: string
}

export interface ABTestSummary {
  meanA: number
  meanB: number
  meanDiff: number
  winnerCount: { A: number; B: number; tie: number }
  total: number
}

export type SurveyQuestionType = 'single' | 'multi' | 'likert' | 'open'

export interface SurveyQuestion {
  type: SurveyQuestionType
  text: string
  options?: string[]
  scale?: { min: number; max: number; minLabel?: string; maxLabel?: string }
}

export interface PersonaSurveyAnswer {
  question: string
  type: SurveyQuestionType
  reaction: string
  choice?: string
  choices?: string[]
  likert?: 1 | 2 | 3 | 4 | 5
  score?: number
  similarities?: number[]
}

export interface PersonaSurveyResponse {
  personaId: number
  personaName: string
  answers: PersonaSurveyAnswer[]
  error?: string
}

export interface PersonaSurveyChoiceCount {
  choice: string
  count: number
}

export interface PersonaSurveyQuestionSummary {
  question: string
  type: SurveyQuestionType
  responseCount: number
  meanScore?: number
  meanLikert?: number
  choiceDistribution?: PersonaSurveyChoiceCount[]
}

export type PersonaSurveyFillSource = 'csv' | 'pasted'

export interface PersonaSurveyFillRun {
  id: number
  source: PersonaSurveyFillSource
  surveyTitle: string
  surveyId?: number
  personaIds: number[]
  questions: SurveyQuestion[]
  responses: PersonaSurveyResponse[]
  summary: PersonaSurveyQuestionSummary[]
  createdAt: string
}
