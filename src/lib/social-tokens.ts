import { Jieba } from '@node-rs/jieba'
import { dict } from '@node-rs/jieba/dict'
import type { SocialPost } from '@/types'

const jieba = Jieba.withDict(dict)

// Brand / service / platform terms — surface elsewhere as filters, so they
// are noise inside a word cloud meant to highlight what people are
// discussing.
const BRAND_STOPWORDS = new Set([
  'LINE', 'GO', 'TAXI', 'LINEGO', 'LINE GO', 'LINE TAXI', 'linego', 'line', 'go', 'taxi',
  '計程車', '共享機車', '共享汽車', '機場接送', '租車', '叫車',
  '共享', '機車', '汽車', // brand components jieba splits out of 共享機車 / 共享汽車
  'Uber', 'uber', 'Yoxi', 'yoxi', '55688', 'WeMo', 'wemo', 'GoShare', 'goshare', 'iRent', 'irent',
  // Platform names and web-content noise
  'Threads', 'threads', 'Twitter', 'twitter', 'Facebook', 'facebook', 'FB', 'fb',
  'Instagram', 'instagram', 'IG', 'ig', 'PTT', 'ptt', 'Dcard', 'dcard',
  'Views', 'views', 'Likes', 'likes',
])

// Common Chinese stopwords that carry no discussion signal. Kept small —
// jieba already drops single-char tokens via our length filter.
const STOPWORDS = new Set([
  '的', '了', '是', '在', '我', '你', '他', '她', '它', '我們', '你們', '他們',
  '也', '都', '就', '要', '會', '不', '沒', '沒有', '有', '可以', '可能', '需要',
  '一個', '一下', '一直', '一些', '這個', '那個', '這樣', '那樣', '這', '那',
  '還是', '還有', '還', '但是', '但', '所以', '因為', '如果', '雖然', '然後',
  '什麼', '怎麼', '怎樣', '為什麼', '哪裡', '哪個', '多少', '幾',
  '真的', '其實', '應該', '已經', '現在', '今天', '昨天', '明天',
  '覺得', '感覺', '知道', '看到', '聽到', '想到',
  '比較', '非常', '很', '太', '蠻', '挺',
  '時候', '時間', '地方', '東西', '事情',
  '使用', '用',
  '可', '不會', '不能', '不要', '不過', '不錯', '不只',
  '只', '只是', '只有', '只能',
  '一', '二', '三', '四', '五', '六', '七', '八', '九', '十',
  '個', '次', '位', '些', '點',
  '與', '和', '或', '及', '跟',
  '從', '到', '對', '把', '被', '讓', '給', '為', '以',
  '上', '下', '前', '後', '左', '右', '中', '裡', '外',
  '吧', '啊', '呢', '嗎', '哦', '喔', '欸', '耶', '阿',
])

const CJK_RANGE = /[一-鿿]/
const HAS_ALNUM = /[A-Za-z0-9]/
const PURE_ALNUM_WORD = /^[A-Za-z0-9][A-Za-z0-9_\-]*$/

function isMeaningful(word: string): boolean {
  if (!word || word.length < 2) return false
  const trimmed = word.trim()
  if (!trimmed || trimmed.length < 2) return false
  if (BRAND_STOPWORDS.has(trimmed) || BRAND_STOPWORDS.has(trimmed.toLowerCase())) return false
  if (STOPWORDS.has(trimmed)) return false
  // Must contain at least one CJK character OR be a >=3-char alphanumeric
  // word. This drops "...", "——", "?!", etc.
  if (CJK_RANGE.test(trimmed)) return true
  if (trimmed.length >= 3 && HAS_ALNUM.test(trimmed) && PURE_ALNUM_WORD.test(trimmed)) return true
  return false
}

export function tokenizePost(post: SocialPost): string[] {
  const text = `${post.title ?? ''} ${post.description ?? ''}`.trim()
  if (!text) return []
  const raw = jieba.cut(text, true) // HMM enabled for better OOV handling
  const out: string[] = []
  for (const t of raw) {
    if (isMeaningful(t)) out.push(t)
  }
  return out
}

export interface SentimentWordCloud {
  positive: { word: string; count: number }[]
  negative: { word: string; count: number }[]
}

export function aggregateWordsBySentiment(posts: SocialPost[], topN = 30): SentimentWordCloud {
  const pos = new Map<string, number>()
  const neg = new Map<string, number>()
  for (const p of posts) {
    if (!p.sentiment || (p.sentiment !== 'positive' && p.sentiment !== 'negative')) continue
    const tokens = tokenizePost(p)
    const target = p.sentiment === 'positive' ? pos : neg
    for (const t of tokens) {
      target.set(t, (target.get(t) ?? 0) + 1)
    }
  }
  function topList(m: Map<string, number>) {
    return Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([word, count]) => ({ word, count }))
  }
  return { positive: topList(pos), negative: topList(neg) }
}
