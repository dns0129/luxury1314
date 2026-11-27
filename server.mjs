// 1314 Luxury 網站伺服器
// - 提供 public/ 內的靜態網頁
// - POST /api/chat：AI 客服，以串流方式回覆文字
//
// 支援任何「OpenAI 相容」的 AI 服務（OpenAI、DeepSeek、通義千問、Kimi、Gemini…），
// 在 .env 設定 AI_API_KEY / AI_BASE_URL / AI_MODEL 即可切換。
// - GET /api/live：直播狀態（Facebook 專頁 1314 Luxury ForLady）
// API key 只放在伺服器端，永遠不會傳到瀏覽器。

import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  initializeWorkspace,
  handleCustomerChat,
  handleAdmin,
  recordWhatsAppPatrolMessages,
  readBody,
  json,
} from "./backend/workspace.mjs";
import { handleWhatsAppPatrol } from "./backend/whatsapp-patrol.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(here, "public");
const PORT = Number(process.env.PORT) || 3000;
await initializeWorkspace();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
};

// ---------- 簡單防濫用：每個 IP 每 10 分鐘最多 30 次提問 ----------
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 30;
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  return list.length > MAX_REQUESTS;
}

async function handleChat(req, res) {
  if (rateLimited(req.socket.remoteAddress)) {
    return json(res, 429, {
      error: "你問得太快啦，休息一陣再試，或者直接 WhatsApp 我哋。",
    });
  }
  return handleCustomerChat(req, res, await readBody(req));
}

// ---------- 直播狀態 ----------
// 資料來源（按優先次序）：
// 1. live.config.json 的 liveNow：手動填入正在直播的影片網址（改完即時生效，毋須重啟）
// 2. Facebook Graph API：在 .env 設定 FB_PAGE_ID + FB_PAGE_TOKEN 後，自動偵測專頁是否正在直播，並更新重溫清單
// 3. 兩者都沒有：只顯示 live.config.json 內的重溫清單
const LIVE_CONFIG = path.join(here, "live.config.json");
const FB_PAGE_ID = process.env.FB_PAGE_ID;
const FB_PAGE_TOKEN = process.env.FB_PAGE_TOKEN;
const FB_ORIGIN = "https://www.facebook.com";
const LIVE_TTL = 60_000;
let liveCache = { at: 0, data: null };

// 只接受 facebook.com 的 https 連結，避免設定檔或 API 回傳的內容被當成任意連結嵌入頁面
function fbUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const u = new URL(value.trim(), FB_ORIGIN);
    return u.protocol === "https:" && /(^|\.)facebook\.com$/.test(u.hostname)
      ? u.href
      : "";
  } catch {
    return "";
  }
}
function clock(seconds) {
  const s = Math.round(Number(seconds) || 0);
  if (!s) return "";
  const h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60),
    r = s % 60;
  return (
    (h ? `${h}:${String(m).padStart(2, "0")}` : `${m}`) +
    `:${String(r).padStart(2, "0")}`
  );
}

async function fetchFacebookLive() {
  const api = new URL(
    `https://graph.facebook.com/v21.0/${encodeURIComponent(FB_PAGE_ID)}/live_videos`,
  );
  api.searchParams.set("fields", "status,permalink_url,title,video{length}");
  api.searchParams.set("limit", "12");
  api.searchParams.set("access_token", FB_PAGE_TOKEN);
  const r = await fetch(api, { signal: AbortSignal.timeout(8000) });
  const body = await r.json();
  if (!r.ok) throw new Error(body?.error?.message || `HTTP ${r.status}`);
  const list = Array.isArray(body.data) ? body.data : [];
  const onAir = list.find((v) => v.status === "LIVE");
  return {
    liveUrl: onAir ? fbUrl(onAir.permalink_url) : "",
    replays: list
      .filter((v) => v.status === "VOD")
      .map((v) => ({
        url: fbUrl(v.permalink_url),
        title: String(v.title || "").slice(0, 60),
        duration: clock(v.video?.length),
      }))
      .filter((v) => v.url),
  };
}

async function getLive() {
  if (liveCache.data && Date.now() - liveCache.at < LIVE_TTL)
    return liveCache.data;
  let cfg = {};
  try {
    cfg = JSON.parse(await fs.readFile(LIVE_CONFIG, "utf8"));
  } catch (err) {
    if (err.code !== "ENOENT")
      console.warn("[live] live.config.json 讀取失敗:", err.message);
  }
  const data = {
    live: false,
    liveUrl: "",
    pageUrl: fbUrl(cfg.pageUrl) || `${FB_ORIGIN}/1314LuxuryForLady/live_videos`,
    replays: (Array.isArray(cfg.replays) ? cfg.replays : [])
      .map((v) => ({
        url: fbUrl(v?.url),
        title: String(v?.title || "").slice(0, 60),
        duration: String(v?.duration || "").slice(0, 10),
      }))
      .filter((v) => v.url),
  };
  const manual = fbUrl(cfg.liveNow || "");
  if (manual) {
    data.live = true;
    data.liveUrl = manual;
  } else if (FB_PAGE_ID && FB_PAGE_TOKEN) {
    try {
      const fb = await fetchFacebookLive();
      if (fb.liveUrl) Object.assign(data, { live: true, liveUrl: fb.liveUrl });
      if (fb.replays.length) data.replays = fb.replays;
    } catch (err) {
      console.warn("[live] Facebook 直播狀態查詢失敗:", err.message);
    }
  }
  data.replays = data.replays.slice(0, 4);
  liveCache = { at: Date.now(), data };
  return data;
}

async function handleLive(res) {
  const data = await getLive();
  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-cache",
  });
  res.end(JSON.stringify(data));
}

async function serveStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  let rel = decodeURIComponent(url.pathname);
  if (rel === "/admin") rel = "/admin/";
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    return res.end();
  }
  try {
    const data = await fs.readFile(file);
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": ext === ".jpg" ? "public, max-age=86400" : "no-cache",
    });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("找不到頁面");
  }
}

http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      if (url.pathname === "/webhooks/whatsapp/patrol")
        return await handleWhatsAppPatrol(req, res, url, recordWhatsAppPatrolMessages);
      if (url.pathname.startsWith("/api/admin/"))
        return await handleAdmin(req, res, url);
      if (req.method === "POST" && url.pathname === "/api/chat")
        return await handleChat(req, res);
      if (req.method === "GET" && url.pathname === "/api/live")
        return await handleLive(res);
      if (req.method === "GET" || req.method === "HEAD")
        return await serveStatic(req, res);
      res.writeHead(405);
      res.end();
    } catch (error) {
      console.error("[request]", error.code || error.name);
      if (res.headersSent) {
        if (!res.writableEnded) res.end();
        return;
      }
      const invalid =
        error instanceof SyntaxError ||
        error instanceof TypeError ||
        /設定|填寫|格式|字元|靈活度|回覆長度|額外參數|過大|啟用狀態/.test(
          error.message,
        );
      json(res, invalid ? 400 : 500, {
        error: invalid ? error.message : "服務暫時未能完成操作，請稍後再試。",
      });
    }
  })
  .listen(PORT, () => {
    console.log(`1314 Luxury 網站已啟動：http://localhost:${PORT}`);
    console.log(
      FB_PAGE_ID && FB_PAGE_TOKEN
        ? "直播：已連接 Facebook 專頁"
        : "直播：使用 live.config.json 設定",
    );
  });
