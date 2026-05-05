# LINE GO Research Center — Phase 0–1 設計文件

> 版本：v1（draft）
> 日期：2026-04-28
> 範圍：A1 / A2 / A3 / A4
> 不在範圍：Phase 2–5（文末預告）

---

## 0. 文件目的

描述 Research Center 從個人研究員工具演進為 LINE GO 內部多角色平台的 **Phase 0–1** 設計。Phase 0 是基礎建設（語意檢索、Insight schema），Phase 1 是 PM 工具的第一個 deliverable。

**範圍**
- **A1** Local Semantic Retriever
- **A2** Insight schema 與抽取流程
- **A3** PM 工具 `/insights`
- **A4** 資訊架構與角色分流

**不在範圍**
- Phase 2 痛點儀表板
- Phase 3 行銷 / 營運風向監測
- Phase 4 Persona simulator calibration
- Phase 5 即時串接 / 客服紀錄整合

---

## 1. 背景與目標

### 1.1 現況
個人研究員工具，local mode（JSON store + Gemini）。已具備：
- Persona 模擬（1:1 chat / group chat 含附圖 / A/B test / 模擬填問卷）
- Survey theme 自動摘要
- 文件上傳、抽文字、enrich
- Keyword-based RAG（局部，未 semantic）

### 1.2 目標
開放給 LINE GO 內部研究員、PM、行銷、營運使用，每角色取得自己需要的洞察。**Phase 0–1 聚焦 PM「找資料」場景**，因為：
- 資料源（問卷 + 逐字稿）已備齊
- ROI 最高，最容易被驗證
- 不依賴後端串接，可獨立先行

### 1.3 非目標（明確排除）
- v1 不做即時問卷串接（CSV 手動匯入足夠）
- v1 不做 SSO / RBAC（先做軟性 role hint）
- v1 不做 simulator calibration（Phase 4）

---

## 2. 使用者與場景

| 角色 | 互動模式 | 主要場景 | Phase 0–1 涵蓋 |
|---|---|---|---|
| 研究員 | Tool-driven | 跑模擬、生 persona、A/B、抽 insights | ✅ 既有功能保留 |
| **PM** | **Query-driven** | 「有沒有用戶提過 X？多少人？情境？」 | ✅ **主目標** |
| 行銷 | Monitor-driven | 風向監測、公關 alert、年齡層 × 合作管道 | ❌ Phase 3 |
| 營運 | Monitor-driven | 看風向（同行銷類） | ❌ Phase 3 |

### 2.1 PM 核心需求拆解

| PM 提問 | 系統能力 |
|---|---|
| 「有沒有人提過想加月租？」 | semantic search across `need` insights |
| 「多少比例的人提過？」 | aggregate（命中數 / 來源 doc 數 / 比例） |
| 「原因是什麼？」 | drill-down 原文 |
| 「情境是什麼？」 | `insight.context` 欄位 |

---

## 3. 系統架構

```
                  ┌─────────────────────────┐
                  │  資料源 (Data Sources)   │
                  ├─────────────────────────┤
                  │  Surveys (CSV)           │
                  │  Transcripts (txt/PDF)   │
                  │  Reports (PDF/PPTX)      │
                  │  Personas (existing)     │
                  └────────────┬─────────────┘
                               │
              ┌────────────────┴─────────────────┐
              │                                  │
       ┌──────▼──────┐                  ┌────────▼────────┐
       │  Document   │                  │  Insight        │
       │  Store      │  ──manual──▶    │  Extractor (A2) │
       │ _store.json │                  │   chatLite      │
       └──────┬──────┘                  └────────┬────────┘
              │                                  │
              │                          ┌───────▼────────┐
              │                          │ _insights.json │
              │                          └───────┬────────┘
              │                                  │
              └────────────────┬─────────────────┘
                               │ embed
                  ┌────────────▼─────────────┐
                  │ Local Semantic Retriever │
                  │ (A1)                     │
                  │ _vector_index.ndjson     │
                  │ Gemini embedding-004     │
                  └────────────┬─────────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
   ┌────▼────┐         ┌──────▼─────┐         ┌──────▼─────┐
   │/insights│         │   /ask     │         │ Persona    │
   │  (A3)   │         │ (existing) │         │ tools      │
   │   PM    │         │   chat     │         │ (existing) │
   └─────────┘         └────────────┘         └────────────┘
```

---

## 4. A1：Local Semantic Retriever

### 4.1 動機
現有 `local-retriever.ts` 是 keyword-based，無法處理 PM 自然語言提問。
例如「有沒有人想要月租」對應原文可能是「希望可以包月」「年費方案」「訂閱制」—— keyword 完全 miss。

### 4.2 設計決策

| 議題 | 決定 |
|---|---|
| 儲存格式 | NDJSON（`public/uploads/_vector_index.ndjson`） |
| Embedding 模型 | Gemini `text-embedding-004`，768-dim |
| Normalize | 寫入時 L2 normalize（查詢時 cosine = dot product） |
| 算法 | brute-force scan + cosine（≤10k chunks 完全夠） |
| 共存 | 保留 `local-retriever.ts`（keyword fallback），新增 `local-semantic-retriever.ts` |

### 4.3 Schema

```ts
interface VectorRecord {
  id: string                          // hash(source_type:source_id:chunk_index)
  source_type: 'survey_open' | 'transcript' | 'report' | 'insight' | 'theme' | 'persona_quote'
  source_id: number
  chunk_index: number
  text: string
  embedding: number[]                 // 768-dim, L2-normalized
  metadata: {
    document_title?: string
    category?: PersonaCategory        // 產品線
    jtbd_stage?: string               // 留位（未來）
    quote_source?: string             // 例：問卷題目
    speaker?: string
    [k: string]: unknown
  }
  created_at: string
}
```

### 4.4 API

```ts
// src/lib/rag/local-semantic-retriever.ts
upsertChunks(records: Omit<VectorRecord, 'id' | 'embedding' | 'created_at'>[]): Promise<number>
deleteBySource(source_type: string, source_id: number): void
semanticSearch(query: string, opts?: {
  topK?: number                       // default 8
  filter?: Partial<{
    source_type: string | string[]
    category: PersonaCategory
    jtbd_stage: string
    document_id: number
  }>
}): Promise<Array<VectorRecord & { score: number }>>
```

### 4.5 索引範圍（v1）
- Survey 開放題（per row）
- Transcript 全文（chunked）
- Report 全文（chunked）
- Persona quotes（per quote）
- 既有 `_survey_summaries.json` themes（read-only 過渡期）
- Insights（A2 完成後加）

### 4.6 Fallback 行為
- `/ask` 與 `/insights` 預設用 semantic
- 若 vector index 為空（首次啟用、未 backfill）→ 自動 fallback 到 keyword retriever，避免使用者看到空白

### 4.7 配額
新增 `gemini_embedding`：**2000/day**

---

## 5. A2：Insight Schema 與抽取

### 5.1 概念分層

```
raw chunk → extract → Insight (atomic) → cluster → Theme (Phase 2)
              ↑                              ↑
              A2 在這                       Phase 2 才做
```

- **Insight** = atomic 單位（一個 row 或 chunk 抽出的單一洞察），可數、可查、可分類
- **Theme** = 聚合後的痛點群（Phase 2 做）
- 既有 `_survey_summaries.json` 的 themes 屬於「半成品 Theme」，read-only 顯示，Phase 2 重做

### 5.2 Insight 類型（v1：3 種）

| Type | 定義 |
|---|---|
| `pain` | 使用者問題、阻礙、不滿 |
| `need` | 使用者想要的功能、改善 |
| `context` | 使用者使用情境、會遇到的狀況（中性） |

（暫不做 `positive`，行銷 Phase 3 再加）

### 5.3 Schema

```ts
type InsightType = 'pain' | 'need' | 'context'

interface Insight {
  id: number
  type: InsightType
  text: string                       // 標準化一句話（主詞用「使用者」）
  quote: string                      // 原文逐字（不改寫）
  context?: string                   // pain/need 發生情境

  // 分類
  category: PersonaCategory          // 產品線
  jtbd_stage?: string                // 留位

  // Traceability
  source_type: 'survey_open' | 'transcript' | 'report'
  source_id: number                  // Document.id
  source_ref: {
    column?: string                  // survey 題目
    row_index?: number               // survey row
    chunk_index?: number             // transcript / report chunk
    speaker?: string                 // transcript 受訪者
  }

  // Meta
  confidence: number                 // 0-1，LLM 自評
  sentiment?: 'negative' | 'neutral' | 'positive'  // 衍生
  created_at: string
}
```

存於 `public/uploads/_insights.json`。

### 5.4 抽取 prompt

```
你是 UX 研究分析師。從以下內容抽取「結構化洞察」。

每個洞察必須屬於以下其中一類：
- pain    使用者遇到的問題、阻礙、不滿
- need    使用者想要的功能、改善、新服務
- context 使用者在什麼情境下使用、會遇到什麼狀況（中性描述）

輸出格式（JSON array）：
[{
  "type": "pain" | "need" | "context",
  "text": "（一句話標準化描述，主詞用「使用者」，去除個人化用語）",
  "quote": "（從原文逐字抄出最具代表性的片段，不改寫，原句口語也保留）",
  "context": "（pain/need 發生的情境；原文有提則填、無則 null）",
  "confidence": 0.0-1.0
}]

判斷規則：
- 一段可以抽 0–N 個洞察（沒洞察就回 []）
- 同一意思重複出現只抽一次
- 內容過於空泛（如「還不錯」「沒意見」）不抽
- 不要編造原文沒有的內容

[題目 / 情境]
{{question_or_context}}

[原文]
{{text}}

只回 JSON array，不要解釋。
```

### 5.5 抽取流程

```
For 每份 document:
  category ← document.category（必填，未填則 fallback 從檔名推斷）
  For 每個 chunk / row:
    text ← chunk text（survey 加題目當 context）
    insights[] ← chatLite(extract_prompt)
    For 每個 insight:
      補上 source_type, source_id, source_ref, category
      補上 sentiment（pain→negative, need→neutral, context→neutral）
      存入 _insights.json
      embed(text + quote) → upsert vector index (source_type='insight')
```

### 5.6 抽取觸發

| 階段 | 觸發方式 |
|---|---|
| **v1（先做）** | 手動：document 詳情頁有按鈕「對這份 doc 抽取 insights」 |
| v1.1（之後加） | 自動：上傳成功時自動跑（可在設定關掉） |

### 5.7 Document.category 處理

新增欄位：
```ts
interface Document {
  // 原有...
  category?: PersonaCategory
}
```

填值策略：
- 上傳時提供 dropdown（可選、可跳過）
- 未填時 fallback 自動從檔名推斷：
  - 檔名含 `rental` / `rent` → 租車
  - `taxi` / `cab` → 計程車
  - `scooter` / `gogoro` / `wemo` / `goshare` → 共享機車
  - 無命中 → 其他
- 既有 4 份 documents 一次性手動 backfill

### 5.8 既有 themes 過渡期

`_survey_summaries.json` 的 themes：
- v1 起 read-only（介面可看、不可編輯、不可重生）
- 同步灌進 vector index（`source_type='theme'`）
- Phase 2 做 atomic insights → Theme 聚合時，舊 themes 顯示「Legacy」標籤、新 Theme 上線後標 superseded

### 5.9 配額

| Quota key | 上限 | 用途 |
|---|---|---|
| `gemini_extract` | **5000/day** | 抽 insights（chatLite） |
| `gemini_embedding` | 2000/day | 索引（A1） |
| `gemini_chat` | 100/day（既有） | persona chat / A/B / survey-fill |

---

## 6. A3：PM 工具 `/insights`

### 6.1 路由
- 新做 `/insights`
- 與 `/ask`（chatbot）並存：
  - `/insights` = 找資料（search engine 樣式）
  - `/ask` = 討論型對話（chatbot 樣式）

### 6.2 頁面結構

```
┌────────────────────────────────────────────────────────────┐
│  [大型搜尋框]                                  [Search]      │
│  自然語言提問，例：有沒有人提過想加月租？                    │
│                                                             │
│  Filters: [產品線 ▼] [類型 ▼] [來源 ▼] [時間 ▼]              │
│                                                             │
│  Quick prompts:                                             │
│  • 有沒有人提過想加月租？                                    │
│  • 使用者在叫車流程哪裡最容易卡住？                          │
│  • 對司機素質的意見有哪些？                                  │
│  • 哪些情境下使用者會放棄不叫了？                            │
└────────────────────────────────────────────────────────────┘

當有查詢結果：
┌────────────────────────────────────────────────────────────┐
│ 📊 Aggregate                                                │
│   共 47 則命中（pain 28 / need 12 / context 7）              │
│   分布：3 份問卷（38）+ 4 份逐字稿（9）                      │
│   產品線：租車 30、計程車 12、共享機車 5                     │
└────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────┐
│ [PAIN] [租車]              sim 0.87  │
│ 使用者反映優惠不會自動帶入，需手動選擇。│
│ ──────────────────────────────────── │
│ 💬「不會自動帶入，都要自己手動選擇」   │
│ 🎯 情境：結帳前選用優惠時              │
│ 📄 來源：rental_2026Q1.csv · 第 234 列│
│      ↗ drill-down                     │
└──────────────────────────────────────┘
（再 N 張 insight card）
```

### 6.3 Insight Card 結構

| 區塊 | 內容 |
|---|---|
| 標籤列 | type badge / category badge / similarity score |
| 主文字 | `insight.text`（標準化描述） |
| Quote | `insight.quote`（原文，引號樣式） |
| 情境 | `insight.context`（若有） |
| 來源行 | source_type + 文件名 + row/chunk index + drill-down link |

### 6.4 Drill-down
**右側 slide-over panel**（不跳新分頁、不開 modal），顯示：
- 原始 row（survey）或原始 chunk（transcript / report）
- 前後文（chunk 前後各 1 chunk）
- 命中部分 highlight
- 顯示同 row / chunk 的其他 insights（彼此關聯）

### 6.5 排序與切換

| 預設 | 可選 |
|---|---|
| similarity（相關度） | frequency（同 text 重複次數） / time（document 上傳新→舊） |

Pivot view：
- list（預設，個別 insight）
- grouped by type（pain / need / context 分區塊）
- grouped by category（產品線分區塊）

### 6.6 API

```ts
// 查詢
POST /api/insights/search
body: {
  query: string
  filters?: {
    category?: PersonaCategory[]
    type?: InsightType[]
    source_type?: string[]
    document_id?: number[]
    after?: string  // ISO date
  }
  topK?: number                     // default 30
  groupBy?: 'none' | 'type' | 'category'
}
response: {
  results: Array<Insight & { similarity: number }>
  aggregate: {
    total: number
    byType: Record<InsightType, number>
    byCategory: Record<PersonaCategory, number>
    bySource: { surveys: number; transcripts: number; reports: number }
  }
  quota: QuotaStatus
  fallback?: 'keyword' | 'raw_chunks'  // 標示是否走 fallback
}

// 抽取
POST /api/insights/extract
body: { document_id: number; force?: boolean }
response: { extracted_count: number; quota: QuotaStatus }

// 列表（給 document 詳情頁）
GET /api/insights?document_id=N
response: { insights: Insight[] }
```

### 6.7 Fallback 行為

| 狀況 | 行為 |
|---|---|
| Insights pool 為空 | 自動 fallback semantic search 原始 chunks（無 type / context 結構） |
| Vector index 也為空 | 自動 fallback keyword search |
| 兩者都空 | empty state「請先上傳資料並抽取 insights」 |

---

## 7. A4：資訊架構與角色分流

### 7.1 模式選擇

| 階段 | 模式 | 說明 |
|---|---|---|
| **v1** | **Section by purpose** | 全員可見、軟性引導，無 enforcement |
| v2（待 SSO） | 混合模式 | 敏感資料 section（客服紀錄等）走 role lock |

### 7.2 Sidebar 結構

```
[LINE GO 研究中心]

🔍 找資料                              ← PM / 行銷 / 營運主場
   └─ Insights 搜尋    NEW
   └─ Ask AI

🔬 研究工具                            ← 研究員主場
   └─ Persona 訪談
   └─ A/B Test
   └─ 模擬填問卷

📁 資料管理                            ← 研究員主場
   └─ Reports
   └─ Surveys
   └─ Transcripts
   └─ Personas

📊 痛點儀表板         (Phase 2)        ← disabled + Coming soon
🌐 風向監測          (Phase 3)        ← disabled + Coming soon

—————
👤 [user name]   設定 ⚙
```

命名原則：**用動詞分類**（找 / 研究 / 管理 / 監測），不用角色名綁死。

### 7.3 Onboarding role picker

第一次進站：
```
歡迎！為了給你最相關的內容，請選一個你的角色：
( ) 研究員
( ) PM
( ) 行銷
( ) 營運
( ) 我自己看就好
            [跳過]   [確認]
```
- 純 hint、可跳過
- 結果存 localStorage `rc_role_hint`
- 「設定」頁可改

### 7.4 Role hint 影響範圍

| 受影響 | 行為 |
|---|---|
| Landing page | PM → `/insights`、研究員 → `/personas`、行銷-營運 → `/insights`（Phase 3 沒做前） |
| Sidebar 預展開 | 對應主場 section 預展開、其他收合 |
| Quick prompts | 跟著角色換文案（PM 看「找需求」、行銷看「找風向」）|
| Empty state | 講人話的角色化提示 |

→ 不阻擋任何功能，純 UX 引導。

### 7.5 Phase 2/3 disabled 顯示

- Sidebar 顯示但 disabled + `Coming soon` badge
- 點進去：不是 404，而是顯示「功能簡介 + 預計上線 + 需求收集表單」
- 收集到的需求進 `_feature_requests.json`，往後做時直接看

---

## 8. 後端整合需求清單

> 跟後端工程師討論時直接帶這份。按資料源分組。

### 8.1 SurveyCake
- [ ] 公司用的方案級別？（webhook 通知功能要進階版以上）
- [ ] 可拿到 SurveyCake API key / webhook 設定權限嗎？
- [ ] 歷史資料：累積幾份問卷、幾筆 row？要 backfill 嗎？匯出方式？
- [ ] 問卷如何標記產品線？（檔名規則 / 標籤 / 自訂欄位 / 後端 metadata）
- [ ] 量表編碼：1–5 還是 1–7？選項是分數還是文字？
- [ ] PII 處理：有姓名 / 電話 / email 嗎？誰負責 mask？
- [ ] 同步模式偏好：webhook（即時）/ 排程拉（每日）/ 手動上傳（fallback）
- [ ] 問卷觸發來源（行銷主動 / 客服跟進 / in-app）→ 影響資料偏誤分析

### 8.2 訪談逐字稿
- [ ] 目前儲存位置：Drive / Notion / 本地？
- [ ] 格式統一嗎？（speaker:text / timestamp / 純摘要）
- [ ] 產品線標記方式
- [ ] 誰負責新增：研究員手動 vs 自動同步 Drive folder

### 8.3 客服紀錄（未來，先確認可行性）
- [ ] 系統：Zendesk / Salesforce / LINE 官方帳號 / 自建？
- [ ] 資料結構：ticket / conversation log / FAQ
- [ ] 量級：日均 / 月均 ticket 數
- [ ] API / export 機制
- [ ] PII 脫敏 ownership

### 8.4 用戶 demographic
- [ ] 公司有 user table？（年齡 / 性別 / 註冊時間 / 活躍度）
- [ ] 問卷答題者能對上 user table 嗎？（user_id / phone / email）
- [ ] 可否拿 read-only API 或定期 dump？

### 8.5 部署 / 安全
- [ ] Host 位置：公司內部 / 公司 GCP / 公司 AWS
- [ ] 認證：員工 SSO / LINE Work / AD / 公司現有 IdP
- [ ] 權限分級：研究員 / PM / 行銷 / 營運 在資料層要不要切？
- [ ] Retention policy：問卷 / 逐字稿保留多久？
- [ ] AI 成本責任：Gemini API key 由誰付？（個人 quota vs 公司 GCP project）

### 8.6 工程協作
- [ ] Pipeline ownership：後端 push vs 我這邊 pull
- [ ] Schema contract（我提供 Document / Insight schema，後端提供 source schema，誰寫 mapping）
- [ ] 失敗重試 / idempotency policy
- [ ] Dev / staging / prod 環境

### 8.7 最重要的 3 個（時間少先問這幾個）
1. **SurveyCake 方案級別 + webhook 權限** → 決定 8.1 走哪條
2. **產品線在資料源裡怎麼標記** → 決定 schema 與分類能不能自動化
3. **認證 + host 環境** → 決定整個架構是 SaaS 還是內網工具

---

## 9. 配額與成本

### 9.1 模型定價（2025 末公開定價估算）

| 模型 | Input / 1M tokens | Output / 1M tokens |
|---|---|---|
| `gemini-2.5-flash-lite` | $0.10 | $0.40 |
| `gemini-2.5-flash` | $0.30 | $2.50 |
| `text-embedding-004` | ~$0.025 | — |

### 9.2 單次抽取成本

| 動作 | 假設 | 估算 |
|---|---|---|
| 1 份 3000-row 問卷（5 開放題、30% 填答） | ~4500 chatLite call | **~$0.7** |
| 1 份逐字稿（50K 字、~50 chunks） | ~50 chatLite call | **~$0.01** |
| 1 份逐字稿 embedding | ~50 chunks × 500 tokens | <$0.001 |
| 1 份問卷 insight embedding | ~2000 insights × 150 tokens | <$0.01 |

### 9.3 每日最大配額用滿

| Quota | 上限 | 估算成本 |
|---|---|---|
| `gemini_extract` | 5000/day | ~$0.75/day |
| `gemini_embedding` | 2000/day | ~$0.03/day |
| `gemini_chat` | 100/day | <$0.01/day |
| **每天上限總和** | — | **~$0.8/day ≈ $24/month** |

### 9.4 預期月用量

- 抽取 one-shot：每份新資料抽一次（$0.7/份）
- 每月新增 ~10 份：**~$7–10**
- 平台日常使用（PM query / persona chat）：**+$1–3**
- **預期：< $15/月**
- **建議公司預算：$30/月固定額度**（含 buffer）

> ⚠️ 數字以 2025 末公開定價估算，實際以 GCP / Gemini API console 帳單為準。

---

## 10. Phase 2–5 預告

| Phase | 內容 | 解決誰的問題 |
|---|---|---|
| **2** | 痛點儀表板：聚合 insights → themes → 排序 / 嚴重度 / drill-down 肇因 | PM + 研究員（總覽型） |
| **3** | 行銷風向監測：Firecrawl 爬 PTT / Threads / Google reviews → sentiment / 時序 / alert / 年齡層 × 合作管道 | 行銷 + 營運 |
| **4** | Persona simulator calibration：真實問卷 vs persona 模擬偏差量化 | 研究員 + 平台可信度 |
| **5** | 即時串接：SurveyCake webhook、客服紀錄整合 | 全員（即時性） |

---

## 11. 待補 / Open items

| 項目 | Owner | 狀態 |
|---|---|---|
| JTBD 階段 taxonomy | 使用者提供 | 進行中 |
| SurveyCake 方案 / API 權限 | 後端確認 | 未開始 |
| SSO 認證機制 | 後端 + IT | 未開始 |
| 公司 user table 取得方式 | 後端 | 未開始 |
| 既有 4 份 document 的 category backfill | 研究員手動 | A2 實作後 |

---

## 12. 實作順序建議

```
1. A1 Local Semantic Retriever
   ├─ NDJSON store + read/write
   ├─ Embedder（含 quota gemini_embedding）
   ├─ Cosine search
   └─ Backfill：既有 documents + themes

2. A2 Insight schema + 抽取
   ├─ Insight type / store
   ├─ Document.category 欄位 + 上傳 UI
   ├─ Extract API + prompt
   ├─ 手動觸發按鈕
   └─ Insight 自動 embed 到 A1

3. A3 PM 工具 /insights
   ├─ Search API
   ├─ /insights 頁面 UI
   ├─ Slide-over drill-down
   └─ Quick prompts / filter / pivot

4. A4 資訊架構
   ├─ Sidebar 重整（現有功能歸類）
   ├─ Onboarding role picker
   ├─ Role hint state + landing 邏輯
   └─ Phase 2/3 disabled 顯示

5. 後端 kickoff
   └─ 帶 §8 清單去討論
```

每階段完成都可獨立 deploy，不需綁定。
