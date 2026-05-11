# Claude Code Hooks

本專案在 `.claude/settings.json` 設定了兩個 hook，目的是把固定的檢查動作自動化，避免每次都要手動跑或在 prompt 中提醒。

## 設定一覽

| Hook | 事件 | 觸發條件 | 行為 |
|---|---|---|---|
| `typecheck` | `PostToolUse` | Edit / Write `.ts` 或 `.tsx` 檔後 | 跑 `npm run check:fast`（= `tsc --noEmit --incremental`）並回報結果 |
| `commit-check` | `Stop` | 對話結束時 | 檢查 git working tree，若有未 commit 改動會在 UI 顯示提醒 |

兩個 hook **永遠 exit 0**，**不會阻擋你下一步**。它們只是 informational。

## 跳過機制

設環境變數 `SKIP_HOOKS=1` 就完全跳過：

```bash
SKIP_HOOKS=1 claude
```

什麼時候會用：
- 探索期故意留 TypeScript 錯誤等等改
- 想做大批檔案改動暫時不要每次 typecheck
- Debug hook 本身的行為

## 為什麼是「informational」不是「blocking」

- Blocking hook 在開發中常常誤觸發（例：故意留 TODO type / 寫了一半的程式碼）
- Hook 失敗 ≠ 我的改動是錯的；可能只是中繼狀態
- 想要強制 gate 的話，CI 或 pre-commit hook 比 Claude Code hook 更適合

## Hook 規範（之後加新 hook 請遵守）

1. **永遠 exit 0**（informational 模式；如真的要 block 才 exit 非 0）
2. **支援 `SKIP_HOOKS=1`** — 每個 hook 開頭加 `[ "$SKIP_HOOKS" = "1" ] && exit 0`
3. **印 prefix `[hook:<name>]`** — 讓使用者清楚這是 hook 在跑
4. **stdout 用於跟 Claude Code 溝通（JSON）；stderr 才是顯示給人類看**
5. **`tight matcher`** — `PostToolUse` 配 `Edit|Write` 比配空字串（全部 tool）省 90% 觸發次數
6. **失敗訊息精簡** — `tail -30` / `head -30` 避免洪水訊息
7. **每加一個 hook，補進這份文件**

## 排錯

| 問題 | 看什麼 |
|---|---|
| Hook 沒跑 | (1) `.claude/settings.json` 語法 `jq . .claude/settings.json` (2) 重啟 Claude Code 重新讀設定 (3) 從 UI 用 `/hooks` 確認 |
| Hook 跑太久 | 看 `timeout` 設定夠不夠，看是否該降頻（改 matcher）|
| Hook 永遠失敗 | 手動 pipe-test：`echo '{"tool_name":"Edit","tool_input":{"file_path":"x.ts"}}' \| .claude/hooks/typecheck.sh` |
| Hook 行為太雜 | 加 `SKIP_HOOKS=1 claude` 暫時關掉所有 hook |

## 檢視 / 管理

在 Claude Code session 內輸入 `/hooks` 開出 UI，可以審視 + enable/disable。
