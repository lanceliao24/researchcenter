export function Footer() {
  const year = new Date().getFullYear()
  return (
    <footer className="border-t border-border/70 bg-background/60 mt-auto">
      <div className="px-6 md:px-10 lg:px-14 py-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-6 w-6 rounded-sm bg-foreground flex items-center justify-center">
            <span className="text-background text-[9px] font-black tracking-tight">RC</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[11px] font-semibold text-foreground tracking-wide">LINE GO · 研究資料中心</span>
            <span className="text-[10px] text-muted-foreground/70">Research Center · 社群 / 訪談 / 問卷整合分析</span>
          </div>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-muted-foreground/80">
          <span className="tracking-wider">v0.1.0</span>
          <span aria-hidden className="text-border">·</span>
          <span>© {year} Research Center</span>
        </div>
      </div>
    </footer>
  )
}
