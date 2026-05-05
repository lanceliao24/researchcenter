'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Radio, Mic, ClipboardList, FileText, TrendingUp, MessageCircle } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from 'recharts'

// --- Mock Data ---
const stats = [
  { label: '社群貼文', value: 1284, icon: Radio, color: 'text-blue-600 bg-blue-50', change: '+128' },
  { label: '訪談逐字稿', value: 23, icon: Mic, color: 'text-green-600 bg-green-50', change: '+3' },
  { label: '問卷回覆', value: 3042, icon: ClipboardList, color: 'text-orange-600 bg-orange-50', change: '+0' },
  { label: '研究報告', value: 8, icon: FileText, color: 'text-purple-600 bg-purple-50', change: '+1' },
]

const trendData = [
  { date: '03/01', 'LINE GO 租車': 32, 'LINE GO 計程車': 45, 'Taxi Go': 18, 'LINE TAXI': 28 },
  { date: '03/08', 'LINE GO 租車': 40, 'LINE GO 計程車': 52, 'Taxi Go': 22, 'LINE TAXI': 25 },
  { date: '03/15', 'LINE GO 租車': 35, 'LINE GO 計程車': 48, 'Taxi Go': 20, 'LINE TAXI': 31 },
  { date: '03/22', 'LINE GO 租車': 55, 'LINE GO 計程車': 61, 'Taxi Go': 28, 'LINE TAXI': 38 },
  { date: '03/29', 'LINE GO 租車': 48, 'LINE GO 計程車': 58, 'Taxi Go': 25, 'LINE TAXI': 42 },
  { date: '04/05', 'LINE GO 租車': 62, 'LINE GO 計程車': 72, 'Taxi Go': 30, 'LINE TAXI': 35 },
  { date: '04/12', 'LINE GO 租車': 58, 'LINE GO 計程車': 68, 'Taxi Go': 33, 'LINE TAXI': 40 },
]

const sentimentData = [
  { name: '正面', value: 42, color: '#22c55e' },
  { name: '中性', value: 35, color: '#eab308' },
  { name: '負面', value: 23, color: '#ef4444' },
]

const platformData = [
  { platform: 'Dcard', count: 486 },
  { platform: 'PTT', count: 312 },
  { platform: 'Threads', count: 198 },
  { platform: 'Mobile01', count: 142 },
  { platform: '新聞媒體', count: 98 },
  { platform: '部落格', count: 48 },
]

const recentPosts = [
  { title: '一日輕旅行 Line Go 使用心得', platform: 'Dcard', keyword: 'LINE GO 租車', sentiment: 'positive' as const, time: '2 小時前' },
  { title: '6公里524元？LINE TAXI 這種收費正常嗎？', platform: 'Dcard', keyword: 'LINE TAXI', sentiment: 'negative' as const, time: '5 小時前' },
  { title: '超級不推薦的 taxi go', platform: 'Dcard', keyword: 'Taxi Go', sentiment: 'negative' as const, time: '8 小時前' },
  { title: 'Line Go 租車體驗 - Golf 新上架', platform: 'PTT', keyword: 'LINE GO 租車', sentiment: 'positive' as const, time: '12 小時前' },
  { title: 'Line taxi 用幾次感覺也不錯', platform: 'Threads', keyword: 'LINE TAXI', sentiment: 'positive' as const, time: '1 天前' },
  { title: '格上租車(line go)XC40刮傷', platform: 'Dcard', keyword: 'LINE GO 租車', sentiment: 'negative' as const, time: '1 天前' },
]

const sentimentColor: Record<string, string> = {
  positive: 'bg-green-100 text-green-700',
  neutral: 'bg-neutral-100 text-neutral-700',
  negative: 'bg-red-100 text-red-700',
}
const sentimentLabel: Record<string, string> = {
  positive: '正面', neutral: '中性', negative: '負面',
}

const lineColors = ['#06C755', '#00B900', '#FF6B35', '#4ECDC4']

export default function PreviewPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold">總覽</h1>
        <p className="text-sm text-neutral-500 mt-1">
          追蹤 4 組關鍵字，整合社群、訪談與問卷資料
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-neutral-500">
                {stat.label}
              </CardTitle>
              <div className={`rounded-lg p-2 ${stat.color}`}>
                <stat.icon className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stat.value.toLocaleString()}</div>
              <p className="text-xs text-green-600 mt-1">
                <TrendingUp className="h-3 w-3 inline mr-1" />
                {stat.change} 本週
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Trend Chart + Sentiment */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">聲量趨勢</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Legend />
                {['LINE GO 租車', 'LINE GO 計程車', 'Taxi Go', 'LINE TAXI'].map((key, i) => (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={key}
                    stroke={lineColors[i]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">情緒分布</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={sentimentData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={65}
                    dataKey="value"
                    label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`}
                    labelLine={false}
                    fontSize={11}
                  >
                    {sentimentData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">平台分布</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={platformData} layout="vertical" margin={{ left: 10 }}>
                  <XAxis type="number" fontSize={11} />
                  <YAxis dataKey="platform" type="category" fontSize={11} width={60} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#171717" radius={[0, 4, 4, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Recent Posts + AI Quick Ask */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">最近社群討論</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentPosts.map((post, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg border hover:bg-neutral-50 transition-colors cursor-pointer">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium line-clamp-1">{post.title}</p>
                    <div className="flex gap-2 mt-2 items-center">
                      <Badge variant="outline" className="text-xs">{post.platform}</Badge>
                      <Badge variant="outline" className="text-xs">{post.keyword}</Badge>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${sentimentColor[post.sentiment]}`}>
                        {sentimentLabel[post.sentiment]}
                      </span>
                      <span className="text-xs text-neutral-400 ml-auto">{post.time}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MessageCircle className="h-4 w-4" />
              AI 快速提問
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-neutral-400">點擊常見問題或到「AI 問答」頁面自由提問</p>
            {[
              '受訪者對 LINE GO 租車最常抱怨什麼？',
              '問卷中 20-30 歲的使用偏好？',
              '社群對 Taxi Go 的正面評價有哪些？',
              'LINE TAXI 和 LINE GO 計程車的差異？',
            ].map((q, i) => (
              <button
                key={i}
                className="w-full text-left text-xs p-2.5 rounded-lg border hover:bg-neutral-50 transition-colors text-neutral-600"
              >
                {q}
              </button>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
