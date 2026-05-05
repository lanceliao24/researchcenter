'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  LogOut, User, Menu, Sun, Moon, Monitor, Settings, Bell,
  LayoutDashboard, Radio, Mic, ClipboardList, FileText, MessageCircle, BookOpen,
} from 'lucide-react'

const primaryNavItems = [
  { href: '/', label: '總覽', icon: LayoutDashboard },
  { href: '/social', label: '社群監測', icon: Radio },
  { href: '/interviews', label: '訪談', icon: Mic },
  { href: '/surveys', label: '問卷', icon: ClipboardList },
  { href: '/reports', label: '報告', icon: FileText },
]

const moreNavItems = [
  { href: '/notebook', label: 'AI 筆記本', icon: BookOpen },
  { href: '/ask', label: 'AI 問答', icon: MessageCircle },
  { href: '/settings', label: '設定', icon: Settings },
]

const allNavItems = [...primaryNavItems, ...moreNavItems]

interface HeaderProps {
  email?: string
  role?: string
}

export function Header({ email, role }: HeaderProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { setTheme } = useTheme()
  const [mobileOpen, setMobileOpen] = useState(false)

  async function handleSignOut() {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const initials = email
    ? email.substring(0, 2).toUpperCase()
    : 'RC'

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href)

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-border/70 bg-background/80 backdrop-blur-sm">
        <div className="flex h-14 items-center px-6 md:px-10 lg:px-14">
          {/* Mobile menu trigger (Sidebar handles logo on md+) */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden h-9 w-9"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Right: Utility icons */}
          <div className="flex items-center gap-1 ml-auto">
            {/* Theme toggle */}
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex items-center justify-center h-9 w-9 rounded-full hover:bg-accent transition-colors">
                <Sun className="h-[18px] w-[18px] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                <Moon className="absolute h-[18px] w-[18px] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                <span className="sr-only">切換主題</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-32">
                <DropdownMenuItem onClick={() => setTheme('light')} className="flex items-center gap-2">
                  <Sun className="h-4 w-4" /> 淺色
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme('dark')} className="flex items-center gap-2">
                  <Moon className="h-4 w-4" /> 深色
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme('system')} className="flex items-center gap-2">
                  <Monitor className="h-4 w-4" /> 系統
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Settings */}
            <Link
              href="/settings"
              className="inline-flex items-center justify-center h-9 w-9 rounded-full hover:bg-accent transition-colors"
            >
              <Settings className="h-[18px] w-[18px] text-muted-foreground" />
            </Link>

            {/* Notifications (placeholder) */}
            <button className="inline-flex items-center justify-center h-9 w-9 rounded-full hover:bg-accent transition-colors relative">
              <Bell className="h-[18px] w-[18px] text-muted-foreground" />
            </button>

            {/* Avatar */}
            <DropdownMenu>
              <DropdownMenuTrigger className="h-9 w-9 rounded-full p-0 inline-flex items-center justify-center hover:ring-2 hover:ring-accent transition-all ml-1">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary">{initials}</AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-3 py-2">
                  <p className="text-sm font-semibold">{email}</p>
                  {role && <p className="text-xs text-muted-foreground mt-0.5">{role}</p>}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push('/settings')} className="flex items-center gap-2">
                  <User className="h-4 w-4" /> 個人設定
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleSignOut} className="flex items-center gap-2 text-red-600 dark:text-red-400">
                  <LogOut className="h-4 w-4" /> 登出
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Mobile nav */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[280px] p-0">
          <SheetTitle className="sr-only">導航選單</SheetTitle>
          <div className="flex h-14 items-center px-5 border-b">
            <Link href="/" onClick={() => setMobileOpen(false)} className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-xl bg-foreground flex items-center justify-center">
                <span className="text-background text-[11px] font-black">RC</span>
              </div>
              <span className="text-sm font-bold">Research Center</span>
            </Link>
          </div>
          <nav className="px-3 py-4 space-y-1">
            {allNavItems.map((item) => {
              const active = isActive(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
                    active
                      ? 'bg-accent font-semibold text-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </SheetContent>
      </Sheet>
    </>
  )
}
