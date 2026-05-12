'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Radio,
  Mic,
  ClipboardList,
  FileText,
  MessageCircle,
  BookOpen,
  Settings,
  Users,
  History,
} from 'lucide-react'

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  editorOnly?: boolean
}
interface NavSection {
  title: string
  items: NavItem[]
}

const navSections: NavSection[] = [
  {
    title: '總覽',
    items: [{ href: '/', label: '儀表板', icon: LayoutDashboard }],
  },
  {
    title: '資料來源',
    items: [
      { href: '/social', label: '社群監測', icon: Radio },
      { href: '/interviews', label: '訪談資料', icon: Mic, editorOnly: true },
      { href: '/surveys', label: '問卷分析', icon: ClipboardList },
      { href: '/reports', label: '報告中心', icon: FileText },
    ],
  },
  {
    title: 'AI 工具',
    items: [
      { href: '/personas', label: '模擬用戶', icon: Users },
      { href: '/notebook', label: 'AI 筆記本', icon: BookOpen },
      { href: '/ask', label: 'AI 問答', icon: MessageCircle },
    ],
  },
  {
    title: '系統',
    items: [
      { href: '/admin/audit-log', label: 'Audit Log', icon: History, editorOnly: true },
      { href: '/settings', label: '設定', icon: Settings },
    ],
  },
]

export function Sidebar({ role }: { role?: string }) {
  const pathname = usePathname()
  const isEditor = role === 'editor'
  const sections = navSections
    .map(s => ({
      ...s,
      items: s.items.filter(item => !item.editorOnly || isEditor),
    }))
    .filter(s => s.items.length > 0)

  return (
    <aside className="hidden md:flex fixed inset-y-0 left-0 z-30 w-[232px] flex-col border-r border-border bg-sidebar">
      {/* Brand */}
      <div className="flex h-14 items-center px-5 border-b border-border">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center bg-foreground text-background text-[11px] font-black tracking-tighter">
            研
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-[13px] font-bold tracking-tight text-foreground">Research Center</span>
            <span className="text-[9px] text-muted-foreground tracking-[0.2em] uppercase">LINE GO</span>
          </div>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-5">
        {sections.map((section, si) => (
          <div key={section.title} className={cn('mb-5', si === sections.length - 1 && 'mb-0')}>
            <div className="px-3 mb-2 text-[10px] font-semibold tracking-[0.15em] uppercase text-muted-foreground/70">
              {section.title}
            </div>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive =
                  item.href === '/'
                    ? pathname === '/'
                    : pathname.startsWith(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 rounded-sm px-3 py-2 text-[13px] transition-colors border-l-2',
                      isActive
                        ? 'bg-accent/60 text-foreground font-semibold border-primary'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent/30 border-transparent'
                    )}
                  >
                    <item.icon className={cn('h-4 w-4', isActive ? 'text-primary' : 'text-muted-foreground')} />
                    <span>{item.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-border/70">
        <div className="text-[10px] text-muted-foreground/70 tracking-wider">
          LINE GO · 研究資料中心
        </div>
      </div>
    </aside>
  )
}
