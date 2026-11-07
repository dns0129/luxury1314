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
| `public/app.js` | AI 客服聊天視窗 |
| `public/img/` | Logo 及產品相片（來自 Threads @1314luxury_preowned） |
| `ai/system-prompt.mjs` | AI 客服的店舖知識及規則：**更新現貨／價錢時改這裡** |
| `server.mjs` | 網頁伺服器 + `/api/chat`（API key 只存在伺服器端） |

## 更新產品

1. 把新相片放進 `public/img/`
2. 在 `index.html` 複製一個 `<article class="card">` 並修改內容
3. 同步更新 `ai/system-prompt.mjs` 內的「精選款」，AI 才會知道
