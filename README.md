# 1314 Luxury 官方網站

粉色系品牌網站，附帶 AI 客服。支援任何 OpenAI 相容的 AI 服務商（OpenAI、DeepSeek、通義千問、Kimi、智譜、Gemini…）。

## 啟動

```bash
npm install --registry=https://registry.npmmirror.com
cp .env.example .env   # 然後在 .env 填入 AI_API_KEY / AI_BASE_URL / AI_MODEL
npm start              # http://localhost:3000
```

`.env.example` 已列出各服務商的 `AI_BASE_URL` 範例。未填 API key 時網站照常運作，AI 客服會引導客人改用 WhatsApp。
啟動後終端機會顯示「AI 客服：已啟用（模型 @ 網址）」；如果 key、模型或網址有誤，錯誤原因會印在終端機。

## 檔案說明

| 檔案 | 用途 |
|---|---|
| `public/index.html` | 網頁內容（產品卡、服務、門市資料） |
| `public/styles.css` | 樣式；顏色集中在最頂的 `:root` |
| `public/app.js` | AI 客服聊天視窗、產品展台／大圖、直播間 |
| `live.config.json` | 直播設定：重溫清單、手動開播網址 |
| `public/img/` | Logo 及產品相片（來自 Threads @1314luxury_preowned） |
| `ai/system-prompt.mjs` | AI 客服的店舖知識及規則：**更新現貨／價錢時改這裡** |
| `server.mjs` | 網頁伺服器 + `/api/chat` + `/api/live`（API key 只存在伺服器端） |

## 更新產品

1. 把新相片放進 `public/img/`
2. 在 `index.html` 複製一個 `<article class="product">` 並修改內容（同一件貨可放多張 `<img>`，第二張起加 `class="alt"`）；展台、編號及大圖會自動生成
3. 同步更新 `ai/system-prompt.mjs` 內的「精選款」，AI 才會知道

## 直播（Facebook 專頁 1314 Luxury ForLady）

網站「直播間」連接 Facebook 專頁直播。開播時導覽列會顯示「直播中」、出現浮動提示，播放器會直接播放直播。

- **自動偵測**：在 `.env` 填入 `FB_PAGE_ID` 及 `FB_PAGE_TOKEN`（專頁存取權杖），伺服器每分鐘查詢一次，並自動更新重溫清單。
- **手動**：開播時把直播影片網址填入 `live.config.json` 的 `"liveNow"`，完結後清空（約一分鐘內生效，毋須重啟）。
- 重溫清單：未設定權杖時，顯示 `live.config.json` 內的 `replays`，有新直播時手動加上網址即可。
