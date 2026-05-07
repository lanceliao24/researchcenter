import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>
}) {
  const params = await searchParams
  const next = typeof params.next === 'string' ? params.next : '/'
  const error = typeof params.error === 'string' ? params.error : null

  const startUrl = `/api/auth/google/start?next=${encodeURIComponent(next)}`

  return (
    <main className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm rounded-xl border bg-card p-8 shadow-sm">
        <h1 className="text-2xl font-semibold mb-2">研究中心登入</h1>
        <p className="text-sm text-muted-foreground mb-6">
          請使用公司 Google 帳號登入，僅授權成員可進入。
        </p>

        {error && (
          <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <Link
          href={startUrl}
          className="block w-full rounded-md bg-primary px-4 py-2.5 text-center text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          以 Google 帳號登入
        </Link>

        <p className="mt-6 text-xs text-muted-foreground">
          登入即表示同意本工具僅供公司內部研究使用。
        </p>
      </div>
    </main>
  )
}
