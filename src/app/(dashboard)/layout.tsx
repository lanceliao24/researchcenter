import { Header } from '@/components/layout/Header'
import { Sidebar } from '@/components/layout/Sidebar'
import { Footer } from '@/components/layout/Footer'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="flex flex-col min-h-screen md:pl-[232px]">
        <Header />
        <main className="flex-1 px-8 md:px-12 lg:px-16 py-8">
          {children}
        </main>
        <Footer />
      </div>
    </div>
  )
}
