import type { SocialPost, Keyword, Document, Profile } from '@/types'

export const mockProfile: Profile = {
  id: 'demo-user',
  email: 'demo@research-center.tw',
  name: 'Demo User',
  role: 'admin',
  created_at: '2026-04-01T00:00:00Z',
}

export const mockKeywords: Keyword[] = [
  { id: 1, keyword: 'LINE GO 租車', is_active: true, created_at: '2026-04-01T00:00:00Z' },
  { id: 2, keyword: 'LINE GO 計程車', is_active: true, created_at: '2026-04-01T00:00:00Z' },
  { id: 3, keyword: 'LINE GO 共享機車', is_active: true, created_at: '2026-04-01T00:00:00Z' },
  { id: 4, keyword: 'LINE TAXI', is_active: true, created_at: '2026-04-01T00:00:00Z' },
]

// Stable English keys — display via getServiceLabel(key) from
// @/lib/service-labels.
export type SocialCategory = 'taxi' | 'rental' | 'scooter' | 'shuttle' | 'driver'

export const socialCategories: SocialCategory[] = ['taxi', 'rental', 'scooter', 'shuttle', 'driver']

// category mapping for each post
export const postCategoryMap: Record<number, SocialCategory> = {}

export const mockSocialPosts: SocialPost[] = [
  // === 租車 ===
  { id: 1, keyword: 'LINE GO 租車', platform: 'PTT', title: '[心得] 非常糟糕的Line Go租車體驗', url: 'https://www.ptt.cc/bbs/car/M.1708321149.A.E97.html', description: '第二次租車體驗會如此糟糕，首先是車輛解鎖問題，客服處理速度不夠快', sentiment: 'negative', fetched_at: '2026-04-17T10:00:00Z', published_at: '2026-04-17T04:00:00Z' },
  { id: 2, keyword: 'LINE GO 租車', platform: 'Dcard', title: '一日輕旅行 Line Go 使用心得', url: 'https://www.dcard.tw/f/transport/p/254178371', description: '整體使用介面清晰易懂，車況也不錯，也看的出來清潔和消毒做得很仔細', sentiment: 'positive', fetched_at: '2026-04-17T10:00:00Z', published_at: '2026-04-17T02:00:00Z' },
  { id: 3, keyword: 'LINE GO 租車', platform: 'Blog', title: 'LINE Go租車評價：完勝iRent？一篇弄懂租車費用', url: 'https://daid207.pixnet.net/blog/posts/16168046402', description: 'Line Go租車主打「租車時間彈性、乾淨、車款品牌多元」，最短只需要租30分鐘', sentiment: 'positive', fetched_at: '2026-04-17T10:00:00Z', published_at: '2026-04-16T18:00:00Z' },
  { id: 4, keyword: 'LINE GO 租車', platform: 'Mobile01', title: '有人用過LINE GO租車嗎', url: 'https://www.mobile01.com/topicdetail.php?f=294&t=6903018', description: '北漂到台北目前邁入第二年，之前在老家有租過irent覺得車況不算太好，想問問LINE GO如何', sentiment: 'neutral', fetched_at: '2026-04-17T10:00:00Z', published_at: '2026-04-16T14:00:00Z' },
  { id: 5, keyword: 'LINE GO 租車', platform: 'PTT', title: '[心得] Line Go 租車體驗 - Golf新上架', url: 'https://www.pttweb.cc/bbs/car/M.1717229219.A.CD0', description: '最近正好一直被Line Go 新的Golf上架的廣告打到，有優惠價平日190/H+折價券就來體驗', sentiment: 'positive', fetched_at: '2026-04-17T10:00:00Z', published_at: '2026-04-15T22:00:00Z' },
  { id: 6, keyword: 'LINE GO 租車', platform: 'Cool3C', title: 'Line就能租車 Line Go租車體驗心得：優惠折價券怎麼領？', url: 'https://www.cool3c.com/article/204395', description: '車體外觀沒有明顯的商標貼紙開在路上比較自在，車內非常乾淨，腳踏墊上幾乎沒有砂石', sentiment: 'positive', fetched_at: '2026-04-17T10:00:00Z', published_at: '2026-04-15T10:00:00Z' },
  { id: 7, keyword: 'LINE GO 租車', platform: 'Dcard', title: '#問題 LINEGO跟irent租車', url: 'https://www.dcard.tw/f/transport/p/254362222', description: 'L-go租車客服超爛的，電話很難打就算了、物品不小心遺失在車子，客服跟踢皮球一樣拖了兩天', sentiment: 'negative', fetched_at: '2026-04-17T10:00:00Z', published_at: '2026-04-14T16:00:00Z' },
  { id: 8, keyword: 'LINE GO 租車', platform: 'GoGoOut', title: '五大線上租車比較 iRent、LINE GO、gogoout 一篇就懂', url: 'https://gogoout.com/blog/irent-zipcar-gogoout/', description: '五大線上租車平台比較，以目前仍持續成長營運的 iRent、URIDE、gogoout、LINE GO 為主要介紹', sentiment: 'neutral', fetched_at: '2026-04-17T10:00:00Z', published_at: '2026-04-13T20:00:00Z' },
  { id: 9, keyword: 'LINE GO 租車', platform: 'Dcard', title: 'LINE GO 還車被卡半小時，客服不退費只給優惠券', url: 'https://www.dcard.tw/topics/LINEGO', description: 'LINE GO，還車被卡半小時，客服不退費只給我優惠券', sentiment: 'negative', fetched_at: '2026-04-17T10:00:00Z', published_at: '2026-04-12T20:00:00Z' },
  { id: 10, keyword: 'LINE GO 租車', platform: 'Dcard', title: '格上租車(line go) XC40刮傷', url: 'https://www.dcard.tw/f/car/p/256478418', description: '我是正常直行車輛對方是路邊未看後方來車的起步機車', sentiment: 'negative', fetched_at: '2026-04-17T10:00:00Z', published_at: '2026-04-11T15:00:00Z' },

  // === 計程車 ===
  { id: 11, keyword: 'LINE TAXI', platform: 'Threads', title: 'LINE TAXI 用過幾次，下次可以試試', url: 'https://www.threads.com/@bubble_wife_mom/post/DGg_VEdBpVE', description: '現在都不用Uber的車了，多半55688，有沒有推薦的叫車平台？可以用Line Go，在台北便宜又好叫車', sentiment: 'positive', fetched_at: '2026-04-17T10:00:00Z', published_at: '2026-04-17T06:00:00Z' },
  { id: 12, keyword: 'LINE GO 計程車', platform: 'Yahoo', title: 'Uber、LINE GO大比拚！十大叫車平台聲量排行榜揭曉', url: 'https://today.line.me/tw/v3/article/Op27yK6', description: '大都會計程車App獲得4.8顆星評價，網友表示「叫車速度很快」、「介面好操作」', sentiment: 'neutral', fetched_at: '2026-04-17T10:00:00Z', published_at: '2026-04-16T22:00:00Z' },
  { id: 13, keyword: 'LINE GO 計程車', platform: 'Yahoo', title: 'LINE GO升級TAXI叫車，幫人叫車功能更強大', url: 'https://tw.stock.yahoo.com/news/line-go升級taxi叫車-幫人叫車功能更強大-024937740.html', description: '裕隆集團旗下LINE GO宣布升級TAXI叫車功能，開放單一帳號可同時管理多趟行程，最多可管理5趟', sentiment: 'positive', fetched_at: '2026-04-17T10:00:00Z', published_at: '2026-04-16T10:00:00Z' },
  { id: 14, keyword: 'LINE TAXI', platform: 'Mobile01', title: '現有計程車比較（Uber、LINE GO、55688、yoxi)', url: 'https://www.mobile01.com/topicdetail.php?f=294&t=7023259', description: '我算蠻常搭計程車，叫車方便性：LINE GO > Uber = yoxi > 55688', sentiment: 'positive', fetched_at: '2026-04-17T10:00:00Z', published_at: '2026-04-15T14:00:00Z' },
  { id: 15, keyword: 'LINE TAXI', platform: 'Money101', title: '最新LINE TAXI 評價好嗎？LINE GO 租車教學/回饋信用卡推薦', url: 'https://www.money101.com.tw/blog/line-taxi-評價-優惠', description: 'LINE GO（原LINE TAXI）介面操作簡單，具備「我要叫車、機場接送、我要租車」3選項', sentiment: 'neutral', fetched_at: '2026-04-17T10:00:00Z', published_at: '2026-04-14T20:00:00Z' },
  { id: 16, keyword: 'LINE TAXI', platform: 'PTT', title: '[問卦] Line Taxi 是叫不到車才用的？', url: 'https://www.pttweb.cc/bbs/Gossiping/M.1740311398.A.827', description: 'Line taxi到底有沒有比較便宜？我好像叫幾次車發現沒比較便宜，喝完酒要叫個車回家', sentiment: 'negative', fetched_at: '2026-04-17T10:00:00Z', published_at: '2026-04-14T08:00:00Z' },
  { id: 17, keyword: 'LINE TAXI', platform: 'Dcard', title: '6公里524元？LINE TAXI 這種收費正常嗎？客服回應傻眼！', url: 'https://www.dcard.tw/f/mood/p/258442736', description: '司機全程冷冰冰，沒有報價、沒有說明費用，全程竄車縫、狂按喇叭超級危險駕駛', sentiment: 'negative', fetched_at: '2026-04-17T10:00:00Z', published_at: '2026-04-13T18:00:00Z' },
  { id: 18, keyword: 'LINE TAXI', platform: 'Dcard', title: 'LINE TAXI 超級貴……', url: 'https://www.dcard.tw/f/talk/p/260864047', description: '不到3公里 LINE TAXI 開車11分鐘收304元', sentiment: 'negative', fetched_at: '2026-04-17T10:00:00Z', published_at: '2026-04-12T16:00:00Z' },
  { id: 19, keyword: 'LINE GO 計程車', platform: 'UDN', title: 'Uber、LINE GO大比拚！十大叫車平台聲量排行', url: 'https://woman.udn.com/woman/story/123162/8867464', description: 'LINE GO（原LINE TAXI）給予乘客一站式移動服務平台，加入LINE GO的LINE官方帳號好友就能叫車', sentiment: 'neutral', fetched_at: '2026-04-17T10:00:00Z', published_at: '2026-04-11T10:00:00Z' },

  // === 共享機車 ===
  { id: 20, keyword: 'LINE GO 共享機車', platform: 'Facebook', title: '2025共享汽機車比一比！WeMo / GoShare / iRent / LINE GO 優缺點總整理', url: 'https://www.facebook.com/DreamLoanTaiwan/posts/', description: '本篇整理 WeMo、GoShare、iRent、LINE GO 等熱門品牌的收費方式與特色，幫助你快速找到最適合的出行工具', sentiment: 'neutral', fetched_at: '2026-04-17T10:00:00Z', published_at: '2026-04-17T08:00:00Z' },
  { id: 21, keyword: 'LINE GO 共享機車', platform: 'YouTube', title: 'LINE GO推共享機車平台！合作WeMo 對決GoShare', url: 'https://www.youtube.com/watch?v=U5q2mJjtfoQ', description: '台灣共享機車大戰三雄變雙雄！GoShare用戶數最多超過230萬，WeMo與iRent結盟，LINE GO也加入戰局', sentiment: 'neutral', fetched_at: '2026-04-17T10:00:00Z', published_at: '2026-04-16T20:00:00Z' },
  { id: 22, keyword: 'LINE GO 共享機車', platform: 'Threads', title: '想小聲詢問 WeMo 跟 GoShare 的差別？', url: 'https://www.threads.com/@hiphopnikesoul_moveon/post/DMNOy1Ey6Ys', description: 'WeMo現在新車很好騎！而且比較便宜！安全帽也有噴香氛噴霧比較香', sentiment: 'positive', fetched_at: '2026-04-17T10:00:00Z', published_at: '2026-04-16T12:00:00Z' },
  { id: 23, keyword: 'LINE GO 共享機車', platform: 'Blog', title: '2025 年共享機車心得：WeMo、GoShare、iRent 經營策略比較', url: 'https://lawrencehou.blogspot.com/2025/08/2025-wemogoshareirent.html', description: 'WeMo Fly 投入後車輛較新，車況和騎乘品質都比較好，GoShare車款最多但車況不一', sentiment: 'neutral', fetched_at: '2026-04-17T10:00:00Z', published_at: '2026-04-15T16:00:00Z' },
  { id: 24, keyword: 'LINE GO 共享機車', platform: 'Yahoo', title: '共享機車新局！WeMo揪四大咖打群架槓上GoShare', url: 'https://tw.stock.yahoo.com/news/共享機車新局-wemo揪四大咖打群架-槓上goshare-045629260.html', description: '未來LINE GO用戶將能在平台上自由選擇多元的移動方案：結合LINE GO租車與WeMo共享機車', sentiment: 'positive', fetched_at: '2026-04-17T10:00:00Z', published_at: '2026-04-14T12:00:00Z' },
  { id: 25, keyword: 'LINE GO 共享機車', platform: 'Money101', title: '2024 共享機車信用卡推薦！哪家最划算? GoShare/WeMo/iRent', url: 'https://www.money101.com.tw/blog/wemo-goshare-irent-共享機車-範圍-優惠', description: 'WeMo 是三大共享機車內唯一有時租方案的，此外也有「WeMo PASS」訂閱制服務', sentiment: 'neutral', fetched_at: '2026-04-17T10:00:00Z', published_at: '2026-04-13T10:00:00Z' },
]

// Build category map
mockSocialPosts.forEach(post => {
  if (post.id <= 10) postCategoryMap[post.id] = 'rental'
  else if (post.id <= 19) postCategoryMap[post.id] = 'taxi'
  else postCategoryMap[post.id] = 'scooter'
})

export const mockDocuments: Document[] = [
  { id: 1, title: '訪談逐字稿_使用者A_20260301.txt', type: 'transcript', file_path: null, status: 'ready', metadata: { interviewee: '使用者A', date: '2026-03-01' }, uploaded_by: 'demo-user', created_at: '2026-03-02T00:00:00Z' },
  { id: 2, title: '訪談逐字稿_使用者B_20260305.txt', type: 'transcript', file_path: null, status: 'ready', metadata: { interviewee: '使用者B', date: '2026-03-05' }, uploaded_by: 'demo-user', created_at: '2026-03-06T00:00:00Z' },
  { id: 3, title: '訪談逐字稿_使用者C_20260312.txt', type: 'transcript', file_path: null, status: 'ready', metadata: { interviewee: '使用者C', date: '2026-03-12' }, uploaded_by: 'demo-user', created_at: '2026-03-13T00:00:00Z' },
  { id: 4, title: '問卷資料_LINE_GO_滿意度調查_2026Q1.csv', type: 'survey', file_path: null, status: 'ready', metadata: { rows: 3042 }, uploaded_by: 'demo-user', created_at: '2026-03-20T00:00:00Z' },
  { id: 5, title: '2026Q1_叫車平台競品分析報告.pdf', type: 'report', file_path: null, status: 'ready', metadata: {}, uploaded_by: 'demo-user', created_at: '2026-04-01T00:00:00Z' },
  { id: 6, title: '2025_LINE_GO_用戶數據年度報告.pdf', type: 'report', file_path: null, status: 'ready', metadata: {}, uploaded_by: 'demo-user', created_at: '2026-04-05T00:00:00Z' },
]

// Trend data for charts (weekly aggregation, last 8 weeks)
export const mockTrendData = [
  { date: '02/23', '共享汽車': 28, '計程車': 38, '共享機車': 12 },
  { date: '03/01', '共享汽車': 32, '計程車': 45, '共享機車': 15 },
  { date: '03/08', '共享汽車': 40, '計程車': 52, '共享機車': 18 },
  { date: '03/15', '共享汽車': 35, '計程車': 48, '共享機車': 22 },
  { date: '03/22', '共享汽車': 55, '計程車': 61, '共享機車': 25 },
  { date: '03/29', '共享汽車': 48, '計程車': 58, '共享機車': 28 },
  { date: '04/05', '共享汽車': 62, '計程車': 72, '共享機車': 32 },
  { date: '04/12', '共享汽車': 58, '計程車': 68, '共享機車': 35 },
]

export const mockSentimentData = [
  { name: '正面', value: 42, color: '#22c55e' },
  { name: '中性', value: 35, color: '#eab308' },
  { name: '負面', value: 23, color: '#ef4444' },
]

export const mockPlatformData = [
  { platform: 'Dcard', count: 486 },
  { platform: 'PTT', count: 312 },
  { platform: 'Threads', count: 198 },
  { platform: 'Mobile01', count: 142 },
  { platform: 'YouTube', count: 86 },
  { platform: 'Blog', count: 65 },
]

export type AlertLevel = 'critical' | 'warning' | 'info'

export interface PrAlert {
  id: string
  level: AlertLevel
  title: string
  detail: string
  source: string
  category: SocialCategory
  trigger: string
  occurred_at: string
}

export const mockPrAlerts: PrAlert[] = [
  {
    id: 'alert-1',
    level: 'critical',
    title: 'LINE TAXI 收費爭議擴散中',
    detail: '「6公里524元」Dcard 原文 12 小時內被轉發到 PTT、Threads、Mobile01，累積 1,280 則討論，負面聲量 +312%',
    source: 'Dcard / PTT / Threads',
    category: 'taxi',
    trigger: '負面聲量 24h 內 +300%',
    occurred_at: '2026-04-20T18:00:00Z',
  },
  {
    id: 'alert-2',
    level: 'warning',
    title: '租車還車卡關客訴增加',
    detail: '近 7 天出現 4 則關於「還車 GPS 卡住、客服不退費只給優惠券」相關抱怨，皆來自台北市用戶',
    source: 'Dcard / PTT',
    category: 'rental',
    trigger: '相同關鍵詞 7 天內出現 ≥ 3 次',
    occurred_at: '2026-04-19T09:00:00Z',
  },
]

export const mockVolumeKPI = {
  positive: { week: 586, prevWeek: 512 },
  negative: { week: 214, prevWeek: 168 },
  net: { week: 372, prevWeek: 344 },
  alertsActive: 2,
}

export const mockPosNegTrend = [
  { date: '02/23', '正向': 48, '負向': 22 },
  { date: '03/01', '正向': 58, '負向': 24 },
  { date: '03/08', '正向': 72, '負向': 28 },
  { date: '03/15', '正向': 66, '負向': 35 },
  { date: '03/22', '正向': 88, '負向': 42 },
  { date: '03/29', '正向': 82, '負向': 36 },
  { date: '04/05', '正向': 106, '負向': 48 },
  { date: '04/12', '正向': 98, '負向': 58 },
]

export interface SurveyLiveSnapshot {
  activeSurveys: number
  todayResponses: number
  weekResponses: number
  completionRate: number // 0~1
  avgMinutes: number
  latestInsight: string
  lastUpdated: string
  hasLiveConnection: boolean // 之後串接資料後改 true
}

export const mockSurveyLive: SurveyLiveSnapshot = {
  activeSurveys: 2,
  todayResponses: 86,
  weekResponses: 412,
  completionRate: 0.78,
  avgMinutes: 4.2,
  latestInsight: '「還車流程不清楚」連續 3 天出現在開放式回答前 3 名',
  lastUpdated: '2026-04-22T09:30:00Z',
  hasLiveConnection: false,
}
