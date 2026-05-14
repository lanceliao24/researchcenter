# Research Center — Handover

LINE GO 研究中心：訪談 / 問卷 / 報告 / Persona 模擬 / 社群輿情 dashboard。
Next.js 16 + React 19 + Gemini + 本機檔案儲存（單機跑）。

---

## 1. 跑起來（5 分鐘）

```bash
git clone git@github.com:lanceliao24/researchcenter.git
cd researchcenter
npm install
cp .env.local.example .env.local
# 編輯 .env.local，填下方「必要環境變數」
npm run dev
# 打開 http://localhost:3000
```

Node 版本：**v22+**（本機驗證過 v22.19.0）。

---

## 2. 必要環境變數

| 變數 | 怎麼拿 | 範例 |
|---|---|---|
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey) | `AIza...` |
| `AUTH_SECRET` | 本機跑 `openssl rand -base64 48` | 32+ 字元隨機字串 |
| `GOOGLE_CLIENT_ID` | Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client | `xxx.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | 同上 | `GOCSPX-...` |
| `ALLOWED_EMAIL_DOMAIN` | 自己定，限制誰能登入 | `linegoapp.com` |
| `EDITOR_EMAILS` | 有寫入權限的 email（逗號分隔） | `you@x.com,cto@x.com` |

### Google OAuth 設定（一次性）
在 Google Cloud Console 建立 OAuth 2.0 Client，**Authorized redirect URIs** 加：
- 本機：`http://localhost:3000/api/auth/google/callback`
- 部署後：`https://<your-domain>/api/auth/google/callback`

### 快速跳過登入（dev only）
不想設 OAuth，只看 UI：
```
NODE_ENV=development
AUTH_DEV_BYPASS=1
```
會自動給 editor session。**Production 不會生效**。

### 選用 API
| 變數 | 何時需要 |
|---|---|
| `GOOGLE_DRIVE_API_KEY` | 要用「從 Google Drive 匯入報告」時 |
| `FIRECRAWL_API_KEY` | 要用「社群輿情爬取」時 |

### 不需要的
`NEXT_PUBLIC_SUPABASE_*` / `SUPABASE_SERVICE_ROLE_KEY` — 本機模式不用，留空即可（舊 RAG 的 fallback，已被 local-semantic-retriever 取代）。

---

## 3. 第一次跑起來該看哪些頁面

| 路徑 | 功能 |
|---|---|
| `/` | Dashboard 總覽 |
| `/reports` | 報告中心（PDF / PPTX 上傳、Drive 匯入、AI summary）|
| `/surveys` | 問卷分析（CSV 上傳 → Top 5 主題）|
| `/interviews` | 訪談逐字稿管理 |
| `/personas` | Persona 模擬（1:1 chat、群聊、A/B test、問卷模擬填答）|
| `/ask` | 全域 AI 問答（RAG）|
| `/social` | 社群輿情（Firecrawl）|
| `/notebook` | Insight 筆記 |
| `/admin/audit-log` | 操作記錄（editor only）|
| `/settings` | 個人配額查詢 |

建議 demo 路徑：先上傳一個 PDF 報告 → 看 AI summary → 去 `/personas` 跟 persona 對話 → `/ask` 全域問答。

---

## 4. 資料存哪

**全部本機 JSON / NDJSON 檔案**（沒接 DB）：

```
public/uploads/
  _store.json                  # documents (reports / surveys / transcripts)
  _survey_summaries.json       # 問卷主題摘要
  _ask_history.json            # AI 問答紀錄
  _persona_chats.json          # 1:1 persona 對話
  _persona_group_chats.json    # 群聊
  _persona_survey_fills.json   # persona 模擬填問卷的 runs
  _vector_index.ndjson         # 本機 vector store (embeddings)
  _quota.json                  # 全站 API 用量
  user-quota.json              # 個人 API 用量
  {type}/                      # 原檔（reports/, surveys/, transcripts/）
  {type}-text/                 # 抽出的純文字（PDF/PPTX → .txt）
  chat-images/                 # persona chat 附圖

data/store/
  audit-log.ndjson             # editor mutation 操作紀錄
```

- 全部都在 `.gitignore` 裡，**不會** push 到 GitHub
- 想清掉重來：刪 `public/uploads/_*.json` 就好

---

## 5. AI 配額（避免燒爆 Gemini 額度）

預設每日上限（`src/lib/quota.ts`）：

| Key | 全站 | Editor | Viewer |
|---|---|---|---|
| `gemini_chat` (Flash) | 100 | 60 | 30 |
| `gemini_chat_pro` (Pro) | 50 | 10 | **0** |
| `gemini_embedding` | 2000 | 1000 | 500 |
| `firecrawl_search` | 50 | 30 | 10 |

可用 env 覆寫（見 `.env.local.example` 底部註解）。Pro model 預設 editor-only。

---

## 6. 部署考量（給 CTO 評估）

⚠️ **重要**：因為用本機檔案儲存，**不能** deploy 到 read-only filesystem 的平台：
- ❌ Cloudflare Pages / Workers
- ❌ Vercel Serverless Functions
- ✅ Railway / Fly.io / Render（有 persistent volume）
- ✅ 自己的 VPS / GCP Compute Engine

要上 Vercel / Cloudflare 需要先把 store 改成 KV / R2 / D1 / Vercel Blob（工作量約 5-15 個 module）。

---

## 7. 常用文件

- `CLAUDE.md` — 專案常識（store 結構、AI 模型分層、auth、quota）
- `AGENTS.md` — Next.js 16 注意事項
- `RESEARCH-METHODS.md` — 研究分析方法論（若有）
- `node_modules/next/dist/docs/` — Next.js 16 官方文件（離線版）

---

## 8. 有疑問問誰

Lance（`lanceliao24@gmail.com`）
