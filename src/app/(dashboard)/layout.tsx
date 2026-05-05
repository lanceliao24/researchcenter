import { redirect } from 'next/navigation'
import { isLocalMode } from '@/lib/local-mode'
import { Header } from '@/components/layout/Header'
import { Sidebar } from '@/components/layout/Sidebar'
import { Footer } from '@/components/layout/Footer'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  let email = 'demo@research-center.tw'
  let role = 'admin'

  if (!isLocalMode()) {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      redirect('/login')
    }

    email = user.email || email
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    role = profile?.role || role
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="flex flex-col min-h-screen md:pl-[232px]">
        <Header email={email} role={role} />
        <main className="flex-1 px-6 md:px-10 lg:px-14 py-6">
          {children}
        </main>
        <Footer />
      </div>
    </div>
  )
}
