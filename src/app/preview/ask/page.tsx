'use client'

import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Send, Bot, User } from 'lucide-react'

const scopes = [
  { value: 'all', label: '全部資料' },
  { value: 'social', label: '僅社群' },
  { value: 'transcript', label: '僅訪談' },
  { value: 'survey', label: '僅問卷' },
  { value: 'report', label: '僅報告' },
]

const mockMessages = [
  {
    role: 'user' as const,
    content: '受訪者對 LINE GO 租車最常抱怨的問題有哪些？',
  },
  {
    role: 'assistant' as const,
    content: `根據訪談逐字稿和社群討論的分析，受訪者對 LINE GO 租車最常抱怨的問題主要有以下幾類：

**1. 車輛清潔度不一致 [來源1][來源3]**
多位受訪者提到雖然整體比其他平台乾淨，但偶爾會遇到車內有菸蒂、落葉、衛生紙等狀況。有用戶回報清潔後仍花了 20 分鐘自行打掃。

**2. 車輛解鎖 / 還車流程卡關 [來源2]**
PTT 上有多篇心得提到第二次租車時車輛解鎖出現問題，客服處理速度不夠快，還車被卡半小時但客服只給優惠券、不退費。

**3. 刮傷賠償爭議 [來源4][來源5]**
Dcard 上有案例是正常行駛被機車刮到，但租車公司的賠償流程和費用計算不透明，用戶擔心被收取天價修理費。

**4. 安心免責的保障範圍不明確 [來源3]**
有受訪者反映「安心免責」的實際保障內容（是否涵蓋車損自負額、額度多少）說明不夠清楚。`,
    sources: [
      { type: '社群', title: '非常糟糕的Line Go租車體驗 - PTT car板' },
      { type: '社群', title: 'LINE GO，還車被卡半小時 - Dcard' },
      { type: '文件', title: '訪談逐字稿_使用者A_20260301.txt' },
      { type: '社群', title: '格上租車(line go)XC40刮傷 - Dcard' },
      { type: '社群', title: '#發問 Line Go 租車安心免責問題 - Dcard' },
    ],
  },
  {
    role: 'user' as const,
    content: '問卷資料中，這些抱怨在不同年齡層的分布如何？',
  },
  {
    role: 'assistant' as const,
    content: `根據問卷資料的交叉分析（共 3,042 份有效回覆）：

| 年齡層 | 清潔度 | 流程卡關 | 賠償爭議 | 保障不明 |
|--------|--------|---------|---------|---------|
| 20-29 歲 | 38% | 45% | 12% | 5% |
| 30-39 歲 | 28% | 30% | 25% | 17% |
| 40-49 歲 | 22% | 15% | 35% | 28% |
| 50+ 歲 | 15% | 42% | 18% | 25% |

**主要發現 [來源6]：**
- **20-29 歲**最在意「流程卡關」（數位原住民對 UX 摩擦容忍度低）
- **40-49 歲**最在意「賠償爭議」和「保障不明」（風險意識較高）
- 清潔度是跨年齡層的共同痛點，但年輕族群提及比例最高`,
    sources: [
      { type: '問卷', title: '問卷資料_LINE_GO_滿意度調查_2026Q1.csv' },
    ],
  },
]

export default function PreviewAskPage() {
  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">AI 研究問答</h1>
        <p className="text-sm text-neutral-500 mt-1">
          針對所有研究資料提問，AI 會引用來源回答
        </p>
        <div className="flex gap-2 mt-3">
          {scopes.map((s, i) => (
            <Badge
              key={s.value}
              variant={i === 0 ? 'default' : 'outline'}
              className="cursor-pointer"
            >
              {s.label}
            </Badge>
          ))}
        </div>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden">
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {mockMessages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}
              >
                {msg.role === 'assistant' && (
                  <div className="h-7 w-7 rounded-full bg-neutral-900 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="h-4 w-4 text-white" />
                  </div>
                )}
                <div
                  className={`rounded-lg px-4 py-2.5 max-w-[80%] ${
                    msg.role === 'user'
                      ? 'bg-neutral-900 text-white'
                      : 'bg-neutral-100'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  {'sources' in msg && msg.sources && (
                    <div className="mt-2 pt-2 border-t border-neutral-200 space-y-1">
                      <p className="text-xs text-neutral-500 font-medium">來源：</p>
                      {msg.sources.map((src, j) => (
                        <div key={j} className="text-xs text-neutral-500">
                          <span className="font-medium">[{src.type}]</span>{' '}
                          {src.title}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {msg.role === 'user' && (
                  <div className="h-7 w-7 rounded-full bg-neutral-200 flex items-center justify-center shrink-0 mt-0.5">
                    <User className="h-4 w-4 text-neutral-600" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="border-t p-4">
          <div className="flex gap-2">
            <Textarea
              placeholder="輸入你的研究問題..."
              className="resize-none min-h-[44px] max-h-32"
              rows={1}
              defaultValue=""
            />
            <Button size="icon">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
