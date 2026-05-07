import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { Sidebar } from '@/components/layout/Sidebar'
import { Footer } from '@/components/layout/Footer'
import { getSessionFromCookies } from '@/lib/auth'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSessionFromCookies()
  if (!session) redirect('/login')
  const email = session.email
  const role = session.role

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
