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

### Persona 模擬填問卷（B2，4 題型 + 雙來源）
- 目的：給定問卷（CSV 或貼文字）+ persona 名單 → 每位 persona 對所選題目逐題作答（單選 / 複選 / 量表 / 開放）
- 兩種輸入來源：
  - **CSV**：`GET /api/personas/survey-fill?surveyId=N` 回傳 columns + samples，使用者勾選欄位（一律當量表題）
  - **貼上問卷**：`POST /api/personas/parse-survey` `{ rawText }` → AI 解析成 `SurveyQuestion[]`（4 題型，矩陣自動拆成多個 likert）；使用者可手動修正題型或刪題
- 執行：`POST /api/personas/survey-fill` 接 `{ source: 'csv'|'pasted', personaIds, ... }`
- Per-type pipeline：
  - **single / multi**：LLM 回 JSON `{ choice/choices, reason }`，自動 fuzzy match 回原 options
  - **likert**：LLM 自然語言反應 → `scoreUsageIntent` → 連續分 + Likert（重用 `USAGE_INTENT_ANCHORS`）
  - **open**：純自然語言 reaction，無分數
- 彙整：likert 給 mean score；single/multi 給 choice distribution；open 只列回答
- Store：`src/lib/persona-survey-fill-store.ts`，runs 持久化於 `_persona_survey_fills.json`，含 `source: 'csv'|'pasted'`
- 配額：每 persona × 題 1 份 `gemini_chat`；解析另耗 1 份；上限 10 personas × 15 題 = 150
- UI：personas page 第三個 selectMode `'survey'`，`SurveyFillDialog` 有兩個 tab（從 CSV / 貼上問卷），結果按題型分支渲染

### A/B test（semantic Likert elicitation）
- 動機：直接讓 LLM 二選一有系統性偏差（參考 arxiv:2510.08338）；改讓 persona 用自然語言回應，再 embedding 比對 anchor
- Endpoint：`POST /api/personas/ab-test`（multipart：`personaIds` / `titleA`+`descriptionA`+`imagesA` / 對應 B）
- Pipeline（per persona）：對 A 呼叫 `generateMultimodal` 取自然反應 → `generateEmbedding` → 跟 5 段 anchor 比 cosine → softmax-weighted 1–5 連續分數 + argmax Likert；對 B 同理
- Anchors：`src/lib/semantic-likert.ts` 的 `USAGE_INTENT_ANCHORS`（1=不會用 → 5=一定會用），模組級快取 anchor embeddings
- 贏家判定：`|scoreA - scoreB| < 0.3` 視為平手（`TIE_THRESHOLD` 在 route.ts）
- 配額：每 persona 耗 2 份 `gemini_chat`（embedding 不計）；單次上限 10 位

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

### Auth（Google Workspace SSO + Editor / Viewer 角色）
- 全站由 `proxy.ts`（Next 16 中介層，舊稱 middleware）擋未登入請求
  - 未登入打 `/api/*` → 401 JSON
  - 未登入打頁面 → 302 redirect 到 `/login?next=...`
  - 公開白名單：`/login`、`/api/auth/google/{start,callback}`、`/api/auth/logout`、`/api/social/cron`
- `src/lib/auth.ts` 提供
  - `requireUser(req)` / `requireEditor(req)` — handler 一行 guard，回傳 `Session` 或 `NextResponse`（401/403）
  - `requireEditorOrCron(req)` — 接受 editor session 或 `Authorization: Bearer ${CRON_SECRET}`
  - `getSessionFromRequest(req)` / `getSessionFromCookies()` — server component 用
  - HMAC-SHA256 signed JWT cookie（`rc_session`，7 天 TTL，HttpOnly + SameSite=Lax + Secure on https）
- 角色判定
  - `ALLOWED_EMAIL_DOMAIN` + `ALLOWED_EMAILS` 決定誰能進來
  - `EDITOR_EMAILS` 名單決定 editor，其他登入者皆為 viewer
- 已包 `requireEditor` 的 routes（mutating only）：
  - `/api/upload`、`/api/documents`（PATCH/DELETE）、`/api/personas`（DELETE）、`/api/personas/generate`
  - `/api/reports/import-drive`、`/api/rag/index`、`/api/social/keywords`、`/api/social/fetch`（or cron）
  - `/api/surveys/monthly-import`、`/api/wiki/ingest`、`/api/embed`
- `/api/files/[...slug]` 包 `requireUser`（檔案 streaming 限登入者）
- 其他 GET 與 AI 對話類 endpoint 預設受 proxy 保護（任何登入者皆可使用）
- Dev 跳過：`NODE_ENV=development` + `AUTH_DEV_BYPASS=1` → 自動給 dev editor session
- 部署前必設環境變數：`AUTH_SECRET`、`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`ALLOWED_EMAIL_DOMAIN`（或 `ALLOWED_EMAILS`）、`EDITOR_EMAILS`、`AUTH_BASE_URL`

### Audit log（誰做了什麼）
- 每次 editor mutation 寫一行 NDJSON 到 `data/store/audit-log.ndjson`
- helper：`logAudit(session, action, resource?, details?)`（`src/lib/audit-log.ts`）
- 已 wired 的 actions：`upload.create`、`document.update/delete`、`persona.delete/generate`、`keyword.add/delete/toggle`、`report.import_drive`、`rag.index/index_all/index_reset`、`social.fetch`、`survey.monthly_import`、`wiki.ingest`、`embed.create`
- 查詢：`GET /api/admin/audit-log?limit=200&email=...&action=...&since=ISO`（需 editor）

### Per-user quota（個人 AI 額度）
- 全域 quota（`_quota.json`）+ 個人 quota（`user-quota.json`）並存，**兩者皆需通過**
- 預設每日上限（可由 env override）：
  - editor：`gemini_chat=60`、`gemini_embedding=1000`、`firecrawl_search=30`
  - viewer：`gemini_chat=30`、`gemini_embedding=500`、`firecrawl_search=10`
- helper：`checkBoth(session, key)` / `incrementBoth(session, key)`（`src/lib/quota.ts`）
- 已 wired：`/api/ask`、`/api/personas/{[id]/chat,group-chat,parse-survey,generate}`
- AI 回應會帶 `quota`（全站）+ `userQuota`（個人）兩個欄位
- 還沒接的 AI endpoints 仍只用全域 quota（TODO 列表寫在自己 commit 裡）
