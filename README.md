# 1314 Luxury 官方網站

粉色系品牌網站，附帶 AI 客服。支援任何 OpenAI 相容的 AI 服務商（OpenAI、DeepSeek、通義千問、Kimi、智譜、Gemini…）。

## 啟動

```bash
npm install --registry=https://registry.npmmirror.com
cp .env.example .env   # 然後在 .env 填入 AI_API_KEY / AI_BASE_URL / AI_MODEL
npm start              # http://localhost:3000
```

`.env.example` 已列出各服務商的 `AI_BASE_URL` 範例。未填 API key 時網站照常運作，AI 客服會引導客人改用 WhatsApp。
AI 客服狀態及連線錯誤可在老闆後台查看。

## 老闆 AI 後台

啟動後開啟 `http://localhost:3000/admin/`，帳號為 `owner`。首次啟動會生成隨機密碼，登入資料放在 `data/admin-access.txt`，也可在首次啟動前透過 `ADMIN_PASSWORD` 指定至少 12 字元的密碼。

- 客戶對話提供完整訊息、回覆時間與模型版本、搜尋、未讀、跟進標記及內部備註，每 15 秒更新。
- AI 調試室可修改指令、店舖知識、模型、API 連線及參數。試聊使用目前草稿，點擊「儲存並生效」後才會套用至新的客服回覆。
- 後台儲存的 AI 設定會優先於 `.env` 及 `ai/system-prompt.mjs`。API key 只保存在伺服器端，後台以空白金鑰欄位沿用既有設定。
- 聊天及設定保存在 `data/`，可用 `DATA_DIR` 調整位置。備份及搬機時需保留整個資料目錄，部署需使用持久磁碟及單一 Node.js 服務實例。
- 從這個版本開始保存網站客服的新對話。訪客以匿名編號識別，登入有效期為 12 小時，重啟服務後需重新登入。

## 檔案說明

| 檔案 | 用途 |
|---|---|
| `public/index.html` | 網頁內容（產品卡、服務、門市資料） |
| `public/styles.css` | 樣式；顏色集中在最頂的 `:root` |
| `public/app.js` | AI 客服聊天視窗、產品展台／大圖、直播間 |
| `live.config.json` | 直播設定：重溫清單、手動開播網址 |
| `public/img/` | Logo 及產品相片（來自 Threads @1314luxury_preowned） |
| `ai/system-prompt.mjs` | AI 客服首次啟動的預設店舖知識及規則，後台儲存後以後台設定為準 |
| `public/admin/` | 老闆後台介面 |
| `backend/workspace.mjs` | 登入驗證、聊天記錄及 AI 設定與調試接口 |
| `server.mjs` | 網頁伺服器 + `/api/chat` + `/api/live`（API key 只存在伺服器端） |

## 更新產品

1. 把新相片放進 `public/img/`
2. 在 `index.html` 複製一個 `<article class="product">` 並修改內容（同一件貨可放多張 `<img>`，第二張起加 `class="alt"`）；展台、編號及大圖會自動生成
3. 在老闆後台「AI 調試室」同步更新店舖知識內的「精選款」並儲存，AI 才會知道

## 直播（Facebook 專頁 1314 Luxury ForLady）

網站「直播間」連接 Facebook 專頁直播。開播時導覽列會顯示「直播中」、出現浮動提示，播放器會直接播放直播。

- **自動偵測**：在 `.env` 填入 `FB_PAGE_ID` 及 `FB_PAGE_TOKEN`（專頁存取權杖），伺服器每分鐘查詢一次，並自動更新重溫清單。
- **手動**：開播時把直播影片網址填入 `live.config.json` 的 `"liveNow"`，完結後清空（約一分鐘內生效，毋須重啟）。
- 重溫清單：未設定權杖時，顯示 `live.config.json` 內的 `replays`，有新直播時手動加上網址即可。

## 老闆後台的消息巡查員

登入後選「消息巡查員」。可依渠道、是否同行及訊息方向搜尋，開啟記錄查看原文，或按「儲存為線索」保留搜尋結果。範圍為 WhatsApp 私訊及已取得的同行私訊。官網訪客對話由原有客服工作台處理。

在「匯入私訊」可載入 WhatsApp 的文字匯出檔、登記其他渠道的同行私訊，或貼入單則訊息。匯入文字檔時，請確認匯出日期格式、時區及自己的發言名稱。再次匯入同一段對話時沿用原聯絡人名稱，方便辨識重複記錄。頁面提供批量 JSON 欄位範例。

正式私訊保存在 `DATA_DIR/patrol.json`。設置 `PATROL_DEMO=1` 可使用獨立樣例庫 `patrol-demo.json`。

## 巡查員的 WhatsApp 私訊來源

在正式資料模式填妥 `WHATSAPP_PATROL_PHONE_NUMBER_ID`、`WHATSAPP_PATROL_VERIFY_TOKEN` 和 `WHATSAPP_PATROL_APP_SECRET` 並重啟後，可把已授權商務帳號的 HTTPS 回調指向 `/webhooks/whatsapp/patrol`。在 Meta 訂閱 `messages` 以接收該號碼的一對一文字訊息，以及圖片、影片和文件的文字說明。原始媒體留在 WhatsApp。`PATROL_DEMO=1` 會關閉回調。

採用 WhatsApp Business App 共存方案的帳號可另訂閱 `smb_message_echoes`，接收由 App 或支援的關聯裝置發出的訊息。一般 Cloud API 的出站狀態回執僅提供訊息編號和送達等狀態；如需其正文，可從原發送系統匯入。巡查員保存首次收到的訊息內容，同一訊息 ID 的重送會去重。這個接收入口不會發送訊息、回溯歷史或同步編輯及撤回。詳見 [Meta 訊息回調](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/) 及 [Business App 發送回聲](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/smb_message_echoes/)。

## GitHub Pages

[品牌網站](https://dns0129.github.io/luxury1314/) · [後台唯讀預覽](https://dns0129.github.io/luxury1314/admin/)

推送到 `main` 後，GitHub Actions 會重新產生並發布靜態網站。商品管理展示內建樣例，門市查詢可在 WhatsApp 確認後發送。更新 `live.config.json` 並推送即可更新重溫清單。

正式帳號登入、商品寫入、AI 對話及私訊回調由 Node.js 服務提供。請依上方啟動說明運行，並為 `DATA_DIR` 配置持久儲存。
