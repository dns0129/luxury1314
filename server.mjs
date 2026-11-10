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
import OpenAI from "openai";
import { SYSTEM_PROMPT } from "./ai/system-prompt.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(here, "public");
const PORT = Number(process.env.PORT) || 3000;
const BASE_URL = process.env.AI_BASE_URL || undefined; // 留空 = OpenAI 官方
const MODEL = process.env.AI_MODEL || (BASE_URL ? "" : "gpt-5.5");

// 個別服務商的額外參數（JSON），例如 DeepSeek 關閉思考模式：{"thinking":{"type":"disabled"}}
let EXTRA_PARAMS = {};
if (process.env.AI_EXTRA_PARAMS) {
  try {
    EXTRA_PARAMS = JSON.parse(process.env.AI_EXTRA_PARAMS);
  } catch {
    console.warn("AI_EXTRA_PARAMS 不是有效的 JSON，已忽略");
  }
}

// 沒有 key 時網站照常運作，只是 AI 客服會引導客人改用 WhatsApp
const client =
  process.env.AI_API_KEY && MODEL
    ? new OpenAI({ apiKey: process.env.AI_API_KEY, baseURL: BASE_URL, timeout: 60_000, maxRetries: 1 })
    : null;

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

// ---------- 驗證前端傳來的對話紀錄 ----------
const MAX_TURNS = 20;
const MAX_CHARS = 1500;
function cleanMessages(input) {
  if (!Array.isArray(input)) return null;
  const msgs = input.slice(-MAX_TURNS).map((m) => ({
    role: m?.role,
    content: typeof m?.content === "string" ? m.content.trim().slice(0, MAX_CHARS) : "",
  }));
  // 截斷後要確保由 user 開始
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  if (!msgs.length) return null;
  for (let i = 0; i < msgs.length; i++) {
    const expected = i % 2 === 0 ? "user" : "assistant";
    if (msgs[i].role !== expected || !msgs[i].content) return null;
  }
  if (msgs.at(-1).role !== "user") return null;
  return msgs;
}

async function readJson(req, limit = 64 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("payload too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const FALLBACK_TEXT =
  "唔好意思，小助手暫時未能回覆 🙏 歡迎直接 WhatsApp 我哋：+852 9417 7866，同事會盡快幫你！";

async function handleChat(req, res) {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket.remoteAddress;
  if (rateLimited(ip)) {
    res.writeHead(429, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("你問得太快啦，休息一陣再試，或者直接 WhatsApp 我哋 💕");
  }

  let messages;
  try {
    messages = cleanMessages((await readJson(req)).messages);
  } catch {
    messages = null;
  }
  if (!messages) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("訊息格式有誤");
  }

  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-cache",
    "X-Accel-Buffering": "no",
  });

  if (!client) {
    return res.end(
      "AI 小助手設定中 ✨ 而家可以先 WhatsApp 我哋：+852 9417 7866，或者親臨尖沙咀門市（星期一至六 12pm–8pm）。"
    );
  }

  let wroteAny = false;
  const abort = new AbortController();
  res.on("close", () => {
    if (!res.writableFinished) abort.abort(); // 客人中途關閉視窗 → 停止生成，節省費用
  });

  try {
    const stream = await client.chat.completions.create(
      {
        ...EXTRA_PARAMS,
        model: MODEL,
        stream: true,
        // 系統提示放最前且固定不變 → 多數服務商會自動快取，降低每次提問成本
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
      },
      { signal: abort.signal }
    );

    for await (const chunk of stream) {
      const text = chunk.choices?.[0]?.delta?.content;
      if (text) {
        wroteAny = true;
        res.write(text);
      }
    }
    if (!wroteAny) res.write(FALLBACK_TEXT);
  } catch (err) {
    if (err instanceof OpenAI.APIUserAbortError || abort.signal.aborted) return;
    if (err instanceof OpenAI.AuthenticationError) {
      console.error("[chat] API key 無效 (401)，請檢查 .env 的 AI_API_KEY 及 AI_BASE_URL");
    } else if (err instanceof OpenAI.NotFoundError) {
      console.error(`[chat] 找不到模型或網址 (404)，請檢查 AI_MODEL=${MODEL} 及 AI_BASE_URL`);
    } else if (err instanceof OpenAI.RateLimitError) {
      console.error("[chat] 用量已達上限或餘額不足 (429)");
    } else if (err instanceof OpenAI.APIConnectionError) {
      console.error("[chat] 連線失敗，請檢查網絡或 AI_BASE_URL:", err.message);
    } else if (err instanceof OpenAI.APIError) {
      console.error(`[chat] API error ${err.status}:`, err.message);
    } else {
      console.error("[chat] unexpected error:", err);
    }
    if (!res.writableEnded) res.write(wroteAny ? "\n\n" + FALLBACK_TEXT : FALLBACK_TEXT);
  } finally {
    if (!res.writableEnded) res.end();
  }
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
    return u.protocol === "https:" && /(^|\.)facebook\.com$/.test(u.hostname) ? u.href : "";
  } catch {
    return "";
  }
}
function clock(seconds) {
  const s = Math.round(Number(seconds) || 0);
  if (!s) return "";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return (h ? `${h}:${String(m).padStart(2, "0")}` : `${m}`) + `:${String(r).padStart(2, "0")}`;
}

async function fetchFacebookLive() {
  const api = new URL(`https://graph.facebook.com/v21.0/${encodeURIComponent(FB_PAGE_ID)}/live_videos`);
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
      .map((v) => ({ url: fbUrl(v.permalink_url), title: String(v.title || "").slice(0, 60), duration: clock(v.video?.length) }))
      .filter((v) => v.url),
  };
}

async function getLive() {
  if (liveCache.data && Date.now() - liveCache.at < LIVE_TTL) return liveCache.data;
  let cfg = {};
  try {
    cfg = JSON.parse(await fs.readFile(LIVE_CONFIG, "utf8"));
  } catch (err) {
    if (err.code !== "ENOENT") console.warn("[live] live.config.json 讀取失敗:", err.message);
  }
  const data = {
    live: false,
    liveUrl: "",
    pageUrl: fbUrl(cfg.pageUrl) || `${FB_ORIGIN}/1314LuxuryForLady/live_videos`,
    replays: (Array.isArray(cfg.replays) ? cfg.replays : [])
      .map((v) => ({ url: fbUrl(v?.url), title: String(v?.title || "").slice(0, 60), duration: String(v?.duration || "").slice(0, 10) }))
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
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-cache" });
  res.end(JSON.stringify(data));
}

async function serveStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  let rel = decodeURIComponent(url.pathname);
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
  .createServer((req, res) => {
    if (req.method === "POST" && req.url === "/api/chat") return handleChat(req, res);
    if (req.method === "GET" && req.url.split("?")[0] === "/api/live") return handleLive(res);
    if (req.method === "GET" || req.method === "HEAD") return serveStatic(req, res);
    res.writeHead(405);
    res.end();
  })
  .listen(PORT, () => {
    console.log(`1314 Luxury 網站已啟動：http://localhost:${PORT}`);
    if (client) {
      console.log(`AI 客服：已啟用（${MODEL} @ ${BASE_URL || "OpenAI"}）`);
    } else if (process.env.AI_API_KEY && !MODEL) {
      console.warn("AI 客服：已設定 AI_BASE_URL，但未設定 AI_MODEL，請在 .env 補上模型名稱");
    } else {
      console.log("AI 客服：未設定 AI_API_KEY（會引導客人用 WhatsApp）");
    }
    console.log(
      FB_PAGE_ID && FB_PAGE_TOKEN
        ? "直播：已連接 Facebook 專頁，自動偵測開播"
        : "直播：未設定 FB_PAGE_ID / FB_PAGE_TOKEN（開播時請在 live.config.json 的 liveNow 填入直播網址）"
    );
  });
