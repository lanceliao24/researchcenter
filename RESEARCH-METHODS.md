# Research Methods

研究中心的分析方法論 SOP。工具能力定義在 `CLAUDE.md`，本文件規範**怎麼用這些能力做分析**。

> 立場：偏嚴謹。寧可標 inconclusive 也不要 over-claim。

---

## 0. 通用分析流程（每次都跑）

每次寫分析（不論手動或請 AI 協作）按這 5 步：

1. **框架** — 標明這是哪種分析（描述性 / 比較性 / 因果性 / 探索性）
2. **資料邊界** — 樣本數、來源、時間範圍、已知盲點
3. **解讀** — 依方法論章節套閾值
4. **偏誤 checklist** — 強制過第 §7 節
5. **Narrative** — 寫成敘事，重大結論標 Confidence

---

## 1. A/B test 結果判讀（B3）

### 不下結論的條件（任一成立即 inconclusive）

- `|meanScoreA - meanScoreB| < 0.5`
- per-persona 贏家一致率 < 70%（10 人中 < 7 人選同邊）
- 高 / 低極端值（score 1 or 5）只集中在 1–2 位 persona 身上
- 配額不足 / persona < 5 位

> 註：系統內 `TIE_THRESHOLD = 0.3` 是判「平手」的下限，本 SOP 把「下結論的下限」拉到 0.5 — 0.3–0.5 之間屬「有方向但不該 launch」。

### 結論可下時要做的

- 寫出**為什麼贏**（讀 per-persona 自然語言反應，找共通理由）
- 標 Confidence（見 §6）
- 列「本次未涵蓋的情境」（資料邊界）

### 跟工具的對應

- Endpoint: `POST /api/personas/ab-test`
- Anchor: `src/lib/semantic-likert.ts` 的 `USAGE_INTENT_ANCHORS`
- 配額：每人 2 份 `gemini_chat`、上限 10 人

---

## 2. Persona 模擬問卷（B2）/ A/B test 結果定位

> **核心立場：模擬結果只當「輔助證據」，不單獨下結論。**

### 必須搭配以下其中一項才算可採信

- 同題目的真實問卷 row（量化交叉驗證）
- 同主題的真實訪談（質化交叉驗證）
- 至少 2 種模擬輸入交叉看（例如 CSV + 貼上問卷各跑一次）

### 講話要這樣講

- ✅ 「模擬結果**指向**租車族對 X 較敏感，需以 N=50 真實問卷驗證」
- ❌ 「租車族對 X 敏感」（把模擬當真實）

### Calibration 完成前

`roadmap` 提到的 calibration（用真實問卷比對 persona 答案、量化偏誤）尚未做。在那之前所有模擬結論都應視為 hypothesis-level。

---

## 3. 訪談主題編碼

### SOP（適用 transcript ≥ 3 篇時）

1. **Open coding**：逐段標 raw code（用受訪者原始說法當 code 名）
2. **Axial coding**：把 raw code 群組成 theme
3. **Selective coding**：選 2–3 個 core theme 撐起 narrative

### 單人 coder 的限制聲明

- 至少 2 人 inter-rater 是金標準
- 你一人 code 完，要在輸出標：`(single coder, low inter-rater confidence)`
- 重大結論需第二人複核才升 Medium 以上 Confidence

### 跟工具的對應

- Transcript 入口：`/api/upload` → `transcript-parser.ts`
- 索引：`/api/rag/index` 後可在 `/ask` 跨 transcript 提問
- Persona 生成則把 transcript 收進 `persona.transcript_digest` 當錨點

---

## 4. 月度問卷主題判讀

### 主題層級（給 stakeholder 看）

1. **Top 5 themes**：`/api/surveys/[id]/summary` 自動產出，主筆要過濾
2. **Trend**：跟前月、6 個月趨勢比，看是否新主題冒出 / 舊主題消退
3. **Open-ended quote**：每個 theme 至少貼 1 句原話（避免概念 leak）

### 不該做的

- 不要拿單月當趨勢
- 不要把開放題的「相關性」當「因果」
- 主題命名用受訪者原話，別用分析師概念詞（「便利性」這種抽象詞慎用）

---

## 5. PR alert（量能突增）決策樹

```
PR alert 觸發
   │
   ├─ 是否與已知活動 / 季節性對齊？
   │    └─ 是 → 標記 expected，不行動
   │
   ├─ 找出貢獻 row（哪幾筆問卷推升量能）
   │    │
   │    ├─ 是否集中在 1–2 位受訪者？
   │    │    └─ 是 → outlier，註記後忽略
   │    │
   │    └─ 是否有共通主題？
   │         ├─ 是 → 寫 weekly trend、追蹤 next month
   │         └─ 否 → 標 noise，不行動
   │
   └─ 跨類別擴散？（租車 + 計程車 + 共享機車都升）
        └─ 是 → 升級為「跨服務別信號」，第二位分析師複核
```

---

## 6. Confidence 標註（只在重大結論標）

### 何謂「重大結論」

- 會被 stakeholder 引用做決策的
- 會寫進月報核心 narrative 的
- 涉及產品方向 / 投資判斷的

### 等級

| 等級 | 條件 |
|------|------|
| **High** | 多 source 三角驗證 + N ≥ 30 + 偏誤 checklist 全過 + （訪談類）≥ 2 人 inter-rater |
| **Medium** | 單一 source 但 N 大（≥ 50 真實問卷），或多 source 但 N 小 |
| **Low** | 模擬結果 only / 訪談 N < 5 / 偏誤未完全排除 / single coder |

### 寫法範例

> 「租車族對價格敏感度顯著高於共享機車族（**Confidence: High**，N=120 真實問卷 + 12 訪談 inter-rater κ=0.78，A/B test 同向）」

---

## 7. 偏誤 checklist（每次分析過一遍）

### Confirmation bias
- [ ] 我是否先有結論才去找證據？
- [ ] 反向假設我有認真試過嗎？
- [ ] 不支持我結論的 row / quote 我有列出來嗎？

### Cherry-picking
- [ ] 我引用的 quote 是否代表多數，還是只是最戲劇化的那條？
- [ ] 統計上我有看分布還是只看 mean / median？
- [ ] 異常值我有處理（移除 or 標註）嗎？

### Recency bias
- [ ] 最近 1–2 週的 sample 是否過度影響結論？
- [ ] 6 個月趨勢我有看過嗎？
- [ ] 季節性 / 活動效應我有排除嗎？

### Sample skew
- [ ] 樣本的服務別分布跟母體一致嗎？
- [ ] 受訪者招募管道是否系統性偏向某群？
- [ ] Persona 模擬時，persona pool 的分布合理嗎？

### Simulator-as-truth（B2/B3 專屬）
- [ ] 我是否把模擬寫得像真實？
- [ ] 模擬結論有對應真實證據嗎？
- [ ] 限制聲明有寫進輸出嗎？

---

## 8. 跟工具的對應速查表

| 分析任務 | 工具入口 | 適用方法論章節 |
|---------|---------|--------------|
| 概念驗證 / quick test | A/B test (`/personas/ab-test`) | §1 + §2 + §6 + §7 |
| 問卷模擬 | survey-fill (`/personas/survey-fill`) | §2 + §6 + §7 |
| 月度報告 | `/insights/monthly-report` | §4 + §5 + §6 + §7 |
| 訪談洞察 | `/ask` (RAG QA) | §3 + §6 + §7 |
| 競品分析 | `/insights/competitor-alignment` | §6 + §7（外加 sample 對等性檢查）|
| 社群輿情 | `/social/*` | §4（趨勢）+ §7 |

---

## 9. 待補（roadmap）

- B2/B3 calibration（用真實問卷量化 simulator 偏誤）→ 完成後可放寬 §2 立場
- 多 anchor sets（不只 USAGE_INTENT，加價格敏感度 / 滿意度）
- Inter-rater 工具支援（目前只能單人 code）
