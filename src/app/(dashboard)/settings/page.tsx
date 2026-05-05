'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Plus, UserPlus } from 'lucide-react'
import type { Keyword, Profile } from '@/types'

const isLocal = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder')

const mockKeywords: Keyword[] = [
  { id: 1, keyword: 'LINE GO 租車', is_active: true, created_at: '2026-04-01T00:00:00Z' },
  { id: 2, keyword: 'LINE GO 計程車', is_active: true, created_at: '2026-04-01T00:00:00Z' },
  { id: 3, keyword: 'Taxi Go', is_active: true, created_at: '2026-04-01T00:00:00Z' },
  { id: 4, keyword: 'LINE TAXI', is_active: true, created_at: '2026-04-01T00:00:00Z' },
]

const mockUsers: Profile[] = [
  { id: 'demo-user', email: 'demo@research-center.tw', name: 'Demo User', role: 'admin', created_at: '2026-04-01T00:00:00Z' },
  { id: 'viewer-1', email: 'viewer@research-center.tw', name: '觀察者', role: 'viewer', created_at: '2026-04-05T00:00:00Z' },
]

export default function SettingsPage() {
  const [keywords, setKeywords] = useState<Keyword[]>([])
  const [newKeyword, setNewKeyword] = useState('')
  const [users, setUsers] = useState<Profile[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    if (isLocal) {
      setKeywords(mockKeywords)
      setUsers(mockUsers)
      return
    }

    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const [{ data: kws }, { data: profiles }] = await Promise.all([
      supabase.from('keywords').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
    ])
    if (kws) setKeywords(kws)
    if (profiles) setUsers(profiles)
  }

  async function addKeyword() {
    if (!newKeyword.trim()) return

    if (isLocal) {
      const newId = Math.max(...keywords.map(k => k.id), 0) + 1
      setKeywords(prev => [{ id: newId, keyword: newKeyword.trim(), is_active: true, created_at: new Date().toISOString() }, ...prev])
      setNewKeyword('')
      return
    }

    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { error } = await supabase.from('keywords').insert({ keyword: newKeyword.trim() })
    if (!error) {
      setNewKeyword('')
      loadData()
    }
  }

  async function toggleKeyword(id: number, isActive: boolean) {
    if (isLocal) {
      setKeywords(prev => prev.map(k => k.id === id ? { ...k, is_active: !isActive } : k))
      return
    }

    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    await supabase.from('keywords').update({ is_active: !isActive }).eq('id', id)
    loadData()
  }

  async function inviteUser() {
    if (!inviteEmail.trim()) return
    setLoading(true)

    if (isLocal) {
      const newUser: Profile = {
        id: `user-${Date.now()}`,
        email: inviteEmail.trim(),
        name: null,
        role: 'viewer',
        created_at: new Date().toISOString(),
      }
      setUsers(prev => [newUser, ...prev])
      setInviteEmail('')
      setLoading(false)
      return
    }

    const res = await fetch('/api/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail.trim() }),
    })
    if (res.ok) {
      setInviteEmail('')
      loadData()
    }
    setLoading(false)
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">設定</h1>
        <p className="text-sm text-muted-foreground mt-1">管理追蹤關鍵字與使用者權限</p>
        {isLocal && (
          <p className="text-xs text-amber-600 mt-1">目前為展示模式，資料僅存於本機記憶體</p>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">追蹤關鍵字</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              placeholder="輸入新關鍵字..."
              onKeyDown={(e) => e.key === 'Enter' && addKeyword()}
            />
            <Button onClick={addKeyword} size="icon">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {keywords.map((kw) => (
              <Badge
                key={kw.id}
                variant={kw.is_active ? 'default' : 'outline'}
                className="cursor-pointer gap-1"
                onClick={() => toggleKeyword(kw.id, kw.is_active)}
              >
                {kw.keyword}
                {!kw.is_active && <span className="text-xs">(停用)</span>}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">使用者管理</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="email@example.com"
              onKeyDown={(e) => e.key === 'Enter' && inviteUser()}
            />
            <Button onClick={inviteUser} disabled={loading}>
              <UserPlus className="h-4 w-4 mr-2" />
              邀請
            </Button>
          </div>
          <div className="space-y-2">
            {users.map((user) => (
              <div key={user.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <p className="text-sm font-medium">{user.email}</p>
                  <p className="text-xs text-muted-foreground">{user.name || '未設定名稱'}</p>
                </div>
                <Badge variant="outline" className="capitalize">{user.role}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
