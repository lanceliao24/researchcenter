# Research Center Wiki Schema

## Purpose

此 Wiki 是 LINE GO 研究資料中心的持久化知識庫。LLM 負責撰寫與維護所有頁面，將來自社群貼文、訪談逐字稿、問卷調查、研究報告等原始資料，整合為結構化、交叉引用的知識網路。

## Directory Structure

```
wiki/
├── SCHEMA.md          # 本文件 — Wiki 結構與操作規範
├── index.md           # 所有頁面的目錄索引
├── log.md             # 時序操作紀錄（append-only）
├── sources/           # 來源摘要頁（每份匯入的文件一頁）
├── entities/          # 實體頁（公司、平台、產品、人物）
├── topics/            # 主題頁（定價、服務品質、使用體驗等）
└── synthesis/         # 綜合分析頁（跨來源比較、趨勢、結論）
```

## Page Format

所有頁面使用 Markdown + YAML frontmatter：

```markdown
---
title: 頁面標題
type: source | entity | topic | synthesis
sources: [來源檔名或 ID 列表]
tags: [相關標籤]
created: 2026-04-17
updated: 2026-04-17
---

頁面內容...

## 相關頁面
- [[other-page]]
```

## Conventions

1. 所有內容使用繁體中文
2. 使用 `[[page-name]]` 格式做交叉引用（不含目錄前綴）
3. 來源引用使用 `[來源: 檔名]` 格式
4. 檔名使用 kebab-case，如 `line-go-pricing.md`
5. 每次操作後更新 index.md 與 log.md

## Page Types

### sources/ — 來源摘要
每份匯入的原始資料對應一頁。包含：
- 文件基本資訊（類型、日期、規模）
- 重點摘要（3-5 點）
- 關鍵發現
- 與其他來源的關聯

### entities/ — 實體頁
針對研究中出現的重要實體。例如：
- 產品：LINE GO、LINE TAXI、iRent、Uber
- 平台：Dcard、PTT、Threads、Mobile01
- 功能：租車服務、叫車服務、客服系統

### topics/ — 主題頁
跨來源的主題分析。例如：
- 定價與收費
- 服務品質
- 車況與整潔度
- App 使用體驗
- 客服回應

### synthesis/ — 綜合分析
跨來源、跨主題的高階分析：
- 競品比較
- 趨勢分析
- 使用者痛點彙整
- 改善建議

## Workflows

### Ingest（匯入）
1. 讀取原始來源文件
2. 在 `sources/` 建立或更新摘要頁
3. 辨識並更新相關 `entities/` 頁面
4. 辨識並更新相關 `topics/` 頁面
5. 判斷是否需要新增或更新 `synthesis/` 頁面
6. 更新 `index.md`
7. 追加紀錄至 `log.md`

### Query（查詢）
1. 讀取 `index.md` 定位相關頁面
2. 讀取相關 wiki 頁面
3. 綜合回答，附頁面引用
4. 如果回答有價值，可存為新 wiki 頁面

### Lint（健康檢查）
檢查項目：
- 頁面間的矛盾
- 被提及但尚未建立的頁面
- 孤立頁面（無任何引用）
- 過時的資訊
- 缺少交叉引用
- 建議需要探索的新方向
