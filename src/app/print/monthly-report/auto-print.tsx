'use client'

import { useEffect } from 'react'

export function AutoPrint() {
  useEffect(() => {
    const btn = document.getElementById('print-btn')
    const handler = () => window.print()
    btn?.addEventListener('click', handler)
    const t = setTimeout(() => window.print(), 600)
    return () => {
      clearTimeout(t)
      btn?.removeEventListener('click', handler)
    }
  }, [])
  return null
}
