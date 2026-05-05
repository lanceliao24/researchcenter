import { notFound } from 'next/navigation'
import { readReport } from '@/lib/monthly-report-store'
import { AutoPrint } from './auto-print'

export const runtime = 'nodejs'

const TONE_LABEL = { positive: '亮點', warning: '需注意', info: '觀察' } as const
const TONE_COLOR = {
  positive: '#059669',
  warning: '#d97706',
  info: '#0284c7',
} as const

export default function MonthlyReportPrintPage() {
  const snap = readReport()
  if (!snap) notFound()

  return (
    <>
      <AutoPrint />
      <style>{`
        @page { size: A4; margin: 18mm 16mm; }
        @media print {
          .no-print { display: none !important; }
        }
        body { font-family: -apple-system, "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif; }
        .report-root { max-width: 720px; margin: 0 auto; padding: 32px 24px; }
        h1 { font-size: 22px; font-weight: 700; margin: 0 0 4px; }
        .subtitle { color: #6b7280; font-size: 12px; }
        .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 18px 0 24px; }
        .kpi { border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 12px; }
        .kpi-label { font-size: 10px; color: #6b7280; }
        .kpi-value { font-size: 20px; font-weight: 700; margin-top: 2px; }
        .headline-box { background: #f9fafb; border-left: 3px solid #6366f1; padding: 14px 18px; margin: 8px 0 24px; border-radius: 0 6px 6px 0; }
        .headline-eyebrow { font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; }
        .headline-text { font-size: 15px; font-weight: 600; margin-top: 4px; line-height: 1.6; }
        .section-title { font-size: 13px; font-weight: 700; color: #111; margin: 24px 0 10px; padding-bottom: 4px; border-bottom: 2px solid #111; }
        .finding { border-left: 3px solid var(--tone); padding: 10px 14px; margin: 10px 0; background: #fafafa; page-break-inside: avoid; border-radius: 0 4px 4px 0; }
        .finding-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; }
        .tag { font-size: 10px; padding: 1px 6px; border-radius: 9999px; border: 1px solid var(--tone); color: var(--tone); }
        .tag-source { font-size: 10px; padding: 1px 6px; border-radius: 9999px; background: #e5e7eb; color: #4b5563; }
        .finding-title { font-size: 13px; font-weight: 600; }
        .row { font-size: 12px; line-height: 1.55; margin-top: 4px; }
        .row-label { font-weight: 600; color: #374151; }
        .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #9ca3af; }
        .toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 16px; background: #f3f4f6; border-radius: 6px; margin-bottom: 24px; }
        .btn { background: #111; color: white; border: none; padding: 6px 14px; border-radius: 4px; font-size: 12px; cursor: pointer; }
      `}</style>
      <div className="report-root">
        <div className="toolbar no-print">
          <div style={{ fontSize: 12, color: '#4b5563' }}>
            預覽用版面 — 列印對話框會自動開啟，可選「另存為 PDF」
          </div>
          <button className="btn" onClick={undefined} type="button" id="print-btn">列印 / 存 PDF</button>
        </div>

        <h1>LINE GO 月度體驗報告</h1>
        <div className="subtitle">
          {snap.month} ・ 產出時間：{new Date(snap.generatedAt).toLocaleString('zh-TW')}
        </div>

        <div className="kpi-grid">
          <div className="kpi"><div className="kpi-label">總填答</div><div className="kpi-value">{snap.overall.responses.toLocaleString()}</div></div>
          <div className="kpi"><div className="kpi-label">滿意度%</div><div className="kpi-value">{snap.overall.satisfied_pct.toFixed(1)}%</div></div>
          <div className="kpi"><div className="kpi-label">NPS</div><div className="kpi-value">{snap.overall.nps >= 0 ? '+' : ''}{snap.overall.nps.toFixed(1)}</div></div>
          <div className="kpi"><div className="kpi-label">服務數</div><div className="kpi-value">{snap.overall.serviceCount}</div></div>
        </div>

        {snap.headline && (
          <div className="headline-box">
            <div className="headline-eyebrow">本月總結</div>
            <div className="headline-text">{snap.headline}</div>
          </div>
        )}

        <div className="section-title">發現 / 數據支持 / 建議行動</div>
        {snap.findings.map((f, i) => (
          <div key={i} className="finding" style={{ ['--tone' as string]: TONE_COLOR[f.tone] }}>
            <div className="finding-head">
              <span className="tag">{TONE_LABEL[f.tone]}</span>
              {f.source && <span className="tag-source">{f.source}</span>}
              <span className="finding-title">{i + 1}. {f.title}</span>
            </div>
            <div className="row"><span className="row-label">數據：</span>{f.evidence}</div>
            <div className="row"><span className="row-label">建議：</span>{f.recommendation}</div>
          </div>
        ))}

        <div className="footer">
          LINE GO Research Center · 由問卷指標、痛點優先級、CSAT × NPS 交叉、週度走勢綜合產出
        </div>
      </div>
    </>
  )
}
