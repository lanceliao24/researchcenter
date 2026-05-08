'use client'

import { useEffect, useState } from 'react'

export function useElapsed(running: boolean): number {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!running) {
      setElapsed(0)
      return
    }
    const start = Date.now()
    setElapsed(0)
    const id = setInterval(() => {
      setElapsed(Math.round((Date.now() - start) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [running])
  return elapsed
}
