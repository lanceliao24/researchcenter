@AGENTS.md

## 專案常識（避免每次重新推斷）

### 資料儲存
- 本機模式（`isLocalMode()` 為 true）時，JSON stores 都放在 `public/uploads/_*.json`：
  - `_store.json` — documents（reports / surveys / transcripts）
  - `_survey_summaries.json` — 問卷 Top 5 主題摘要
  - `_ask_history.json` — AI 問答對話紀錄
  - `_persona_group_chats.json` — Persona 多人群聊
  - `_persona_survey_fills.json` — Persona 模擬填問卷的 runs（B2）
  - `_quota.json` — 每日 API 配額用量
- 上傳的原檔與抽出的文字：`public/uploads/{type}/` 與 `public/uploads/{type}-text/`

### AI 與配額
- Gemini 模型 fallback chain 定義在 `src/lib/gemini.ts`
  - `chat()` → flash → flash-lite → flash-latest
  - `chatLite()` → flash-lite → flash → flash-latest
  - `generateEmbedding()` → gemini-embedding-001 → -2 → -2-preview
- Quota 由 `src/lib/quota.ts` 管理
  - `gemini_chat` 每日 100 次（`QUOTA_GEMINI_CHAT_PER_DAY`）
  - `gemini_embedding` 每日 2000 次（`QUOTA_GEMINI_EMBEDDING_PER_DAY`）
  - `firecrawl_search` 每日 50 次
  - 寫新 AI 功能前先 `checkQuota()`，用完再 `incrementQuota()`

### Local Semantic Retriever（A1，2026-04-28）
- `src/lib/rag/local-semantic-retriever.ts`：NDJSON-backed vector store + L2-normalized cosine search
- 儲存：`public/uploads/_vector_index.ndjson`（每行一筆 `VectorRecord`）
- API：`upsertChunks` / `deleteBySource` / `semanticSearch` / `getIndexStats`
- 索引範圍由 `src/lib/rag/raw-indexer.ts` 處理：survey 開放題（per row × col）/ transcript / report / themes
- HTTP：
  - `POST /api/rag/index { document_id | all | reset }` 觸發 backfill（**會燒 embedding quota**）
  - `GET  /api/rag/index` 回傳 index stats + quota
  - `POST /api/rag/search { query, topK?, filter? }` 語意查詢
- 每筆 upsert + 每次 search 都 `incrementQuota('gemini_embedding')`
- 舊的 `local-retriever.ts`（keyword）保留作 fallback；舊的 `embedder.ts` / `retriever.ts` 仍綁 Supabase，本機不用

### 分類規範
- Persona 與報告的分類統一為 **服務別**：`租車` / `計程車` / `共享機車` / `其他`
- 型別定義在 `src/types/index.ts` 的 `PersonaCategory` + `PERSONA_CATEGORIES`

### Persona 對話附圖
- 1:1 chat 支援附圖（UI 截圖 / 產品畫面 → persona 給第一反應）
- Endpoint：`POST /api/personas/[id]/chat` 接 `multipart/form-data`（`message` + 最多 3 張 `images`）
- 存檔：`public/uploads/chat-images/{time36}-{hex}.{ext}`，MIME 限 jpg/png/webp/gif，單張 ≤ 5 MB
- Helper：`src/lib/chat-image-store.ts`（saveChatImage / resolveChatImagePath / 常數 MAX_*）
- Gemini 多模態：`chatWithHistory` 第 4 參 `ChatImagePart[]`（base64 + mimeType → inlineData parts）；one-shot 多模態用 `generateMultimodal(systemPrompt, parts)`
- 訊息紀錄：`PersonaChatMessage.images?: string[]`（存 public URL）
- Group chat 也支援附圖（2026-04-28）：`POST /api/personas/group-chat` 改吃 multipart（`personaIds` 用 comma-separated 字串、`message`、`images[]`），有圖時每位 persona 用 `generateMultimodal` 看到同一張圖；`GroupMessage.images?: string[]` 只在 user type 上設值

### Persona 功能索引（細節看各檔頂部 comment）
- **B2 模擬填問卷**：`src/app/api/personas/survey-fill/route.ts` + `parse-survey/route.ts` — 4 題型 × CSV/貼上雙來源；store: `persona-survey-fill-store.ts`
- **A/B test**：`src/app/api/personas/ab-test/route.ts` — semantic Likert 雙評分；anchors: `src/lib/semantic-likert.ts`
- **Persona simulator RAG**：`src/app/api/personas/reindex/route.ts` — 訪談原文 vector 索引，1:1 / group / ab-test 用 top-3 retrieve 取代靜態 digest

### 檔案解析
- PDF → `pdf-parse`，抽文字另存 `.txt` 到 `{type}-text/`
- PPTX → `jszip` 載 zip，抓 `ppt/slides/slide*.xml` 中的 `<a:t>` 文字；slides 陣列另存 `.slides.json`
- CSV → `papaparse`，`header: true, skipEmptyLines: true`

### 報告 enrich 流程
共用 helper：`src/lib/report-ingest.ts` 的 `ingestReportBuffer(buffer, filename, mime)`
1. 存原檔到 uploads
2. PDF/PPTX 抽文字
3. 若 `extractedText.length > 50` 且 quota 未滿 → `chatLite` 推論 category + tags + summary
4. `addLocalDocument` 建立紀錄
上傳路由（`/api/upload`）與 Drive 匯入（`/api/reports/import-drive`）共用

### Drive 匯入
- 靠 `GOOGLE_DRIVE_API_KEY`（`.env.local`），僅能讀「知道連結的任何人可看」的檔案
- Google Docs/Slides 自動以 `/export?mimeType=application/pdf` 拉回 PDF
- `src/app/api/reports/import-drive/route.ts`

### UI 模式
- shadcn/ui，不要用 `DialogTrigger asChild`（有型別錯誤），改用 controlled Dialog（`open` + `onOpenChange`）
- 使用 Next 16 `useSearchParams` 時，父層要包 `<Suspense>`（例：`src/app/(dashboard)/ask/page.tsx`）
- 所有 server file 都用絕對路徑引入 `@/lib/*`、`@/types` 等

### Slash command / 快捷
- 從外部開專案：`rc`（shell alias，`~/.zshrc`）
- 在 cc session 內恢復狀態：`/research-center`（user-level slash command）

### Gemini 模型分層（src/lib/gemini.ts）
- `chat()` Flash 主：一般 AI 對話 / 解析 / 萃取
- `chatLite()` Lite 主：上傳 enrich、單問卷主題摘要、報告推薦
- `chatPro()` Pro 主（fallback Flash）：5 個 narrative/analysis endpoint
- `chatWithHistory()` Flash + 對話歷史：1:1 persona chat
- `generateMultimodal()` Flash + 圖：group-chat 帶圖、ab-test
- `generateEmbedding()` `gemini-embedding-001` fallback chain

