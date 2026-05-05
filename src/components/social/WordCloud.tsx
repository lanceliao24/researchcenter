'use client'

import { useMemo } from 'react'

interface Word {
  word: string
  count: number
}

interface Props {
  words: Word[]
  tone: 'positive' | 'negative'
  emptyLabel?: string
}

export function WordCloud({ words, tone, emptyLabel = '尚無資料' }: Props) {
  const items = useMemo(() => {
    if (!words || words.length === 0) return []
    const sorted = [...words].sort((a, b) => b.count - a.count).slice(0, 20)
    const max = Math.max(...sorted.map(w => w.count))
    const min = Math.min(...sorted.map(w => w.count))
    const range = Math.max(1, max - min)
    return sorted.map((w, i) => {
      const norm = (w.count - min) / range
      const size = 12 + norm * 20
      const weight = norm > 0.5 ? 600 : norm > 0.2 ? 500 : 400
      const opacity = 0.55 + norm * 0.45
      return { ...w, size, weight, opacity, key: `${w.word}-${i}` }
    })
  }, [words])

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-xs text-muted-foreground">
        {emptyLabel}
      </div>
    )
  }

  const colorBase = tone === 'positive'
    ? 'oklch(0.42 0.10 160)'
    : 'oklch(0.48 0.14 25)'

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 py-4 px-2 min-h-[160px]">
      {items.map((w) => (
        <span
          key={w.key}
          title={`${w.word} · ${w.count}`}
          style={{
            fontSize: `${w.size}px`,
            fontWeight: w.weight,
            color: colorBase,
            opacity: w.opacity,
            lineHeight: 1.1,
          }}
          className="select-none transition-opacity hover:opacity-100"
        >
          {w.word}
        </span>
      ))}
    </div>
  )
}
