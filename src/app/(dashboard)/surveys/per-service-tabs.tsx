'use client'

import { useState } from 'react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { IssueTrendsCard } from './issue-trends'
import { CounterInsightsCard } from './counter-insights'

const TABS: { value: string; label: string }[] = [
  { value: 'all', label: '全部服務' },
  { value: 'taxi', label: '計程車' },
  { value: 'rental', label: '共享汽車' },
  { value: 'scooter', label: '共享機車' },
  { value: 'shuttle', label: '機場接送' },
]

export function PerServiceTabs() {
  const [active, setActive] = useState<string>('all')
  const filter = active === 'all' ? undefined : active

  return (
    <Tabs value={active} onValueChange={setActive}>
      <div className="space-y-4">
        <IssueTrendsCard
          serviceFilter={filter}
          tabSlot={
            <TabsList>
              {TABS.map(t => (
                <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
              ))}
            </TabsList>
          }
        />
        <CounterInsightsCard serviceFilter={filter} />
      </div>
    </Tabs>
  )
}
