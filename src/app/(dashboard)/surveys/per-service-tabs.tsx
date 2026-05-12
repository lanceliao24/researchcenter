'use client'

import { useState, useCallback } from 'react'
import { IssueTrendsCard } from './issue-trends'
import { MergedServicePanels } from './merged-service-panels'

export function PerServiceTabs() {
  const [refreshKey, setRefreshKey] = useState(0)
  const bump = useCallback(() => setRefreshKey(k => k + 1), [])

  return (
    <div className="space-y-4">
      <IssueTrendsCard hideServiceSections onRegenerateComplete={bump} />
      <MergedServicePanels refreshKey={refreshKey} />
    </div>
  )
}
