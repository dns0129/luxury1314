import fs from "node:fs/promises";
import path from "node:path";
import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import OpenAI from "openai";
import { SYSTEM_PROMPT } from "../ai/system-prompt.mjs";

import { readProduct, sampleProducts } from "./products.mjs";
import { isWhatsAppPatrolConfigured } from "./whatsapp-patrol.mjs";
import { addPatrolRecords, demoRecords, markPatrolPeer, patrolFeed, readPatrolImport, savePatrolFinding } from "./patrol.mjs";

const DATA_DIR = path.resolve(process.env.DATA_DIR || "data");
const inventoryDemo = process.env.INVENTORY_DEMO === "1";
const productsFile = path.join(DATA_DIR, inventoryDemo ? "products-demo.json" : "products.json");
async function loadProducts() {
  return (await readOptional(productsFile)) ?? (inventoryDemo ? structuredClone(sampleProducts) : []);
}
const patrolDemo = process.env.PATROL_DEMO === "1";
const patrolFile = path.join(DATA_DIR, patrolDemo ? "patrol-demo.json" : "patrol.json");
async function loadPatrolRecords() {
  const records = (await readOptional(patrolFile)) ?? (patrolDemo ? demoRecords : []);
  return records.filter(item => item.sourceType === "private_message" && (item.channel === "whatsapp" || item.isPeer === true));
}
function storePatrolRecords(incoming) {
  return serialized(async () => {
    const result = addPatrolRecords(await loadPatrolRecords(), incoming);
    if (result.changed) await atomicWrite(patrolFile, result.items);
    return {added: result.added, duplicates: result.duplicates};
  });
}
export async function recordWhatsAppPatrolMessages(records) {
  if (patrolDemo) throw new Error("演示資料庫不能接收真實回調");
  if (!records.length) return {added: 0, duplicates: 0};
  return storePatrolRecords(readPatrolImport(records, false, true));
}
const CHAT_DIR = path.join(DATA_DIR, "conversations");
const SETTINGS_FILE = path.join(DATA_DIR, "ai-settings.json");
const AUTH_FILE = path.join(DATA_DIR, "owner.json");
const sessions = new Map();
const loginAttempts = new Map();
const conversations = new Map();
const active = new Set();
let queue = Promise.resolve();
let settings;
let owner;

async function atomicWrite(file, data) {
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temp, JSON.stringify(data, null, 2), { mode: 0o600 });
    await fs.rename(temp, file);
  } finally {
    await fs.rm(temp, { force: true });
  }
}
function serialized(task) {
  const next = queue.then(task);
  queue = next.catch(() => {});
  return next;
}
async function readOptional(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
function passwordHash(password, salt) {
  return scryptSync(password, salt, 64).toString("hex");
}
export async function initializeWorkspace() {
  await fs.mkdir(CHAT_DIR, { recursive: true, mode: 0o700 });
  owner = await readOptional(AUTH_FILE);
  if (!owner) {
    const password =
      process.env.ADMIN_PASSWORD || randomBytes(18).toString("base64url");
    if (password.length < 12)
      throw new Error("ADMIN_PASSWORD 必須至少 12 個字元");
    const salt = randomBytes(16).toString("hex");
    owner = { salt, hash: passwordHash(password, salt) };
    await atomicWrite(AUTH_FILE, owner);
    if (!process.env.ADMIN_PASSWORD) {
      await fs.writeFile(
        path.join(DATA_DIR, "admin-access.txt"),
        `1314 Luxury 老闆後台\n網址 http://localhost:${process.env.PORT || 3000}/admin/\n帳號 owner\n密碼 ${password}\n\n此檔案包含登入密碼，請妥善保管。\n`,
        { mode: 0o600 },
      );
    }
  }
  let extra = {};
  try {
    extra = JSON.parse(process.env.AI_EXTRA_PARAMS || "{}");
  } catch {}
  settings = (await readOptional(SETTINGS_FILE)) || {
    model: process.env.AI_MODEL || (process.env.AI_BASE_URL ? "" : "gpt-5.5"),
    baseURL: process.env.AI_BASE_URL || "https://api.openai.com/v1",
    apiKey: process.env.AI_API_KEY || "",
    systemPrompt: SYSTEM_PROMPT,
    temperature: 0.7,
    maxTokens: 1024,
    extraParams: extra,
    enabled: true,
    revision: 1,
    updatedAt: null,
  };
  for (const name of await fs.readdir(CHAT_DIR)) {
    if (!name.endsWith(".json")) continue;
    const chat = JSON.parse(
      await fs.readFile(path.join(CHAT_DIR, name), "utf8"),
    );
    if (chat.status === "responding") {
      chat.status = "interrupted";
      chat.error = "服務重新啟動，這次回覆未完成。";
      await atomicWrite(path.join(CHAT_DIR, name), chat);
    }
    conversations.set(chat.id, chat);
  }
  console.log(
    `老闆後台：http://localhost:${process.env.PORT || 3000}/admin/（登入資料見 data/admin-access.txt，或使用已設定的 ADMIN_PASSWORD）`,
  );
}
export function json(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(data));
}
export async function readBody(req, limit = 96 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("資料過大");
    chunks.push(chunk);
  }
  const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new Error("訊息格式有誤");
  return body;
}
function cookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || "").split(";").map((part) => part.trim().split("=")),
  );
}
function setCookie(req, res, name, value, maxAge) {
  const secure = req.socket.encrypted ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`,
  );
}
function isAuthenticated(req) {
  const token = cookies(req).luxury_owner;
  const session = sessions.get(token);
  if (!session) return false;
  if (session < Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}
function publicSettings() {
  const { apiKey, ...safe } = settings;
  return {
    ...safe,
    hasApiKey: Boolean(apiKey),
    connected: Boolean(apiKey && settings.model && settings.enabled),
  };
}
function safeSettings(input, base = settings) {
  const result = { ...base };
  for (const key of ["model", "baseURL", "systemPrompt"]) {
    if (input[key] !== undefined) {
      if (typeof input[key] !== "string") throw new Error("設定格式有誤");
      result[key] = input[key].trim();
    }
  }
  if (!result.model || result.model.length > 120)
    throw new Error("請填寫有效的模型名稱");
  if (!result.systemPrompt || result.systemPrompt.length > 30000)
    throw new Error("AI 指令需為 1–30000 個字元");
  const url = new URL(result.baseURL);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error("請填寫有效的服務網址");
  result.baseURL = url.href.replace(/\/$/, "");
  if (input.apiKey !== undefined && input.apiKey !== "") {
    if (typeof input.apiKey !== "string" || input.apiKey.length > 512)
      throw new Error("API key 格式有誤");
    result.apiKey = input.apiKey.trim();
  }
  if (input.temperature !== undefined) {
    if (
      !Number.isFinite(input.temperature) ||
      input.temperature < 0 ||
      input.temperature > 2
    )
      throw new Error("靈活度需介乎 0–2");
    result.temperature = input.temperature;
  }
  if (input.maxTokens !== undefined) {
    if (
      !Number.isInteger(input.maxTokens) ||
      input.maxTokens < 64 ||
      input.maxTokens > 16384
    )
      throw new Error("回覆長度需介乎 64–16384 tokens");
    result.maxTokens = input.maxTokens;
  }
  if (input.enabled !== undefined) {
    if (typeof input.enabled !== "boolean") throw new Error("啟用狀態有誤");
    result.enabled = input.enabled;
  }
  if (input.extraParams !== undefined) {
    if (
      !input.extraParams ||
      typeof input.extraParams !== "object" ||
      Array.isArray(input.extraParams)
    )
      throw new Error("額外參數必須為 JSON 物件");
    result.extraParams = input.extraParams;
  }
  return result;
}
function summary(chat) {
  const users = chat.messages.filter((message) => message.role === "user");
  return {
    id: chat.id,
    title: users[0]?.content.slice(0, 60) || "新對話",
    preview: chat.messages.at(-1)?.content.slice(0, 100) || "",
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
    unread: chat.userVersion > (chat.readVersion || 0),
    followUp: Boolean(chat.followUp),
    status: chat.status,
    userCount: users.length,
    messageCount: chat.messages.length,
    visitor: chat.visitor,
    source: chat.source,
  };
}
async function updateConversation(id, edit) {
  return serialized(async () => {
    const current = conversations.get(id);
    if (!current) throw new Error("找不到對話");
    const draft = structuredClone(current);
    edit(draft);
    await atomicWrite(path.join(CHAT_DIR, `${id}.json`), draft);
    conversations.set(id, draft);
    return draft;
  });
}
function providerError(error) {
  const status = error.status;
  if (status === 401 || status === 403)
    return "AI 服務驗證失敗，請檢查 API key 及服務權限。";
  if (status === 404) return "找不到 AI 模型或服務，請檢查模型名稱及服務網址。";
  if (status === 429) return "AI 服務用量已達上限，請檢查餘額或稍後再試。";
  if (status === 400) return "AI 服務不接受目前的參數，請檢查模型及額外參數。";
  return "AI 服務連線失敗或逾時，請檢查服務設定後再試。";
}
const FALLBACK =
  "小助手暫時未能回覆。歡迎 WhatsApp +852 9417 7866，同事會為你跟進。";
export async function streamReply(res, messages, config, onDone) {
  let reply = "";
  let status = "completed";
  let error = null;
  let usage = null;
  const started = Date.now();
  const abort = new AbortController();
  const onClose = () => {
    if (!res.writableFinished) abort.abort();
  };
  res.on("close", onClose);
  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  const emit = (text) => {
    reply += text;
    if (!res.destroyed) res.write(text);
  };
  try {
    if (!config.enabled || !config.apiKey || !config.model) {
      status = "disabled";
      emit(
        "AI 小助手設定中。歡迎 WhatsApp +852 9417 7866，或親臨尖沙咀門市（星期一至六 12pm–8pm）。",
      );
    } else {
      const client = new OpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
        timeout: 60000,
        maxRetries: 1,
      });
      const stream = await client.chat.completions.create(
        {
          ...config.extraParams,
          model: config.model,
          temperature: config.temperature,
          max_tokens: config.maxTokens,
          stream: true,
          messages: [
            { role: "system", content: config.systemPrompt },
            ...messages,
          ],
        },
        { signal: abort.signal },
      );
      for await (const chunk of stream) {
        if (chunk.usage) usage = chunk.usage;
        const text = chunk.choices?.[0]?.delta?.content;
        if (text) emit(text);
      }
      if (abort.signal.aborted) {
        status = "interrupted";
        error = "客戶已離開，這次回覆未完成。";
      } else if (!reply.trim()) {
        status = "error";
        error = "AI 服務傳回空白回覆。";
        emit(FALLBACK);
      }
    }
  } catch (err) {
    if (abort.signal.aborted) {
      status = "interrupted";
      error = "客戶已離開，這次回覆未完成。";
    } else {
      status = "error";
      error = providerError(err);
      emit((reply ? "\n\n" : "") + FALLBACK);
    }
  } finally {
    res.off("close", onClose);
    const result = {
      reply,
      status,
      error,
      usage,
      durationMs: Date.now() - started,
      model: config.model,
      revision: config.revision,
    };
    try {
      if (onDone) await onDone(result);
    } catch (err) {
      console.error("[workspace] 無法保存 AI 回覆", err.code || err.name);
    }
    if (!res.destroyed && !res.writableEnded) res.end();
  }
}
export async function handleCustomerChat(req, res, body) {
  const incoming = body.messages;
  if (
    !Array.isArray(incoming) ||
    !incoming.length ||
    incoming.length > 40 ||
    incoming.some(
      (message) =>
        !message ||
        !["user", "assistant"].includes(message.role) ||
        typeof message.content !== "string",
    )
  )
    return json(res, 400, { error: "訊息格式有誤" });
  const latest = incoming.at(-1);
  if (
    latest.role !== "user" ||
    !latest.content.trim() ||
    latest.content.length > 1500
  )
    return json(res, 400, { error: "請輸入 1–1500 個字元的訊息" });
  let visitor = cookies(req).luxury_visitor;
  if (!/^[a-f0-9]{48}$/.test(visitor || "")) {
    visitor = randomBytes(24).toString("hex");
    setCookie(req, res, "luxury_visitor", visitor, 365 * 86400);
  }
  const visitorId = createHash("sha256").update(visitor).digest("hex");
  let chat = body.conversationId
    ? conversations.get(body.conversationId)
    : null;
  if (body.conversationId && (!chat || chat.visitorId !== visitorId))
    return json(res, 404, { error: "找不到對話，請開始新對話" });
  if (chat && active.has(chat.id))
    return json(res, 409, { error: "小助手正在回覆，請稍候" });
  const now = new Date().toISOString();
  if (!chat) {
    chat = {
      id: randomUUID(),
      visitorId,
      visitor: `訪客 ${visitorId.slice(0, 6).toUpperCase()}`,
      source: "網站客服",
      language: String(req.headers["accept-language"] || "").slice(0, 80),
      device: /mobile|android|iphone/i.test(req.headers["user-agent"] || "")
        ? "手機"
        : "電腦 / 平板",
      createdAt: now,
      updatedAt: now,
      messages: [],
      status: "responding",
      userVersion: 0,
      readVersion: 0,
      notes: "",
      followUp: false,
    };
  }
  active.add(chat.id);
  const id = chat.id;
  try {
    await serialized(async () => {
      const draft = structuredClone(conversations.get(id) || chat);
      draft.messages.push({
        id: randomUUID(),
        role: "user",
        content: latest.content.trim(),
        createdAt: now,
      });
      draft.userVersion++;
      draft.updatedAt = now;
      draft.status = "responding";
      draft.error = null;
      await atomicWrite(path.join(CHAT_DIR, `${id}.json`), draft);
      conversations.set(id, draft);
      chat = draft;
    });
    res.setHeader("X-Conversation-Id", id);
    const context = chat.messages
      .filter(
        (message) => message.role === "user" || message.status === "completed",
      )
      .slice(-20)
      .map(({ role, content }) => ({ role, content }));
    while (context[0]?.role === "assistant") context.shift();
    await streamReply(
      res,
      context,
      structuredClone(settings),
      async (result) => {
        await updateConversation(id, (draft) => {
          draft.messages.push({
            id: randomUUID(),
            role: "assistant",
            content: result.reply,
            createdAt: new Date().toISOString(),
            status: result.status,
            model: result.model,
            revision: result.revision,
            durationMs: result.durationMs,
            usage: result.usage,
          });
          draft.status = result.status;
          draft.error = result.error;
          if (["error", "interrupted", "disabled"].includes(result.status))
            draft.followUp = true;
          draft.updatedAt = new Date().toISOString();
        });
      },
    );
  } finally {
    active.delete(id);
  }
}
export async function handleAdmin(req, res, url) {
  const route = url.pathname.slice("/api/admin".length);
  if (req.method !== "GET") {
    const origin = req.headers.origin;
    if (
      (origin &&
        origin !==
          `${req.socket.encrypted ? "https" : "http"}://${req.headers.host}`) ||
      !req.headers["content-type"]?.startsWith("application/json")
    )
      return json(res, 403, { error: "請從後台頁面操作" });
  }
  if (route === "/login" && req.method === "POST") {
    const ip = req.socket.remoteAddress;
    const now = Date.now();
    const attempts = (loginAttempts.get(ip) || []).filter(
      (t) => now - t < 15 * 60000,
    );
    if (attempts.length >= 10)
      return json(res, 429, { error: "登入嘗試過多，請 15 分鐘後再試" });
    const body = await readBody(req, 4096);
    const hash = passwordHash(
      String(body.password || "").slice(0, 1024),
      owner.salt,
    );
    if (
      body.username !== "owner" ||
      !timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(owner.hash, "hex"))
    ) {
      attempts.push(now);
      loginAttempts.set(ip, attempts);
      return json(res, 401, { error: "帳號或密碼有誤" });
    }
    loginAttempts.delete(ip);
    for (const [token, expiry] of sessions)
      if (expiry < now) sessions.delete(token);
    const token = randomBytes(32).toString("hex");
    sessions.set(token, now + 12 * 3600000);
    setCookie(req, res, "luxury_owner", token, 12 * 3600);
    return json(res, 200, { ok: true });
  }
  if (!isAuthenticated(req))
    return json(res, 401, { error: "請先登入老闆後台" });
  if (route === "/session" && req.method === "GET")
    return json(res, 200, { username: "owner" });
  if (route === "/logout" && req.method === "POST") {
    sessions.delete(cookies(req).luxury_owner);
    setCookie(req, res, "luxury_owner", "", 0);
    return json(res, 200, { ok: true });
  }
  if (route === "/patrol" && req.method === "GET") {
    const records = await loadPatrolRecords();
    return json(res, 200, patrolFeed(records, url.searchParams, patrolDemo, isWhatsAppPatrolConfigured()));
  }
  if (["/patrol/save-finding", "/patrol/mark-peer"].includes(route) && req.method === "POST") {
    const {id} = await readBody(req, 4096);
    return serialized(async () => {
      const records = await loadPatrolRecords();
      const result = route === "/patrol/save-finding" ? savePatrolFinding(records, id) : markPatrolPeer(records, id);
      if (!result) return json(res, 404, {error: "找不到原私訊"});
      const {items, ...summary} = result;
      if (result.added || result.changed) await atomicWrite(patrolFile, items);
      return json(res, 200, summary);
    });
  }
  if (route === "/patrol/import" && req.method === "POST") {
    const body = await readBody(req, 1024 * 1024);
    const incoming = readPatrolImport(body.records, patrolDemo);
    return json(res, 200, await storePatrolRecords(incoming));
  }
  if (route === "/products" && req.method === "GET")
    return json(res, 200, { demo: inventoryDemo, items: await loadProducts() });
  if (route === "/products" && ["POST", "PUT"].includes(req.method)) {
    const body = await readBody(req, 720000);
    const item = readProduct(body);
    return serialized(async () => {
      const items = await loadProducts();
      const i = items.findIndex(record => record.sku === item.sku);
      if (req.method === "POST" && i >= 0) return json(res, 409, {error: "這個 SKU 已存在"});
      if (req.method === "PUT" && i < 0) return json(res, 404, {error: "找不到這件商品"});
      if (i >= 0 && items[i].revision !== body.revision)
        return json(res, 409, {error: "商品已在其他視窗更新，請重新整理"});
      item.revision = i >= 0 ? items[i].revision + 1 : 1;
      if (i >= 0) items[i] = item;
      else items.push(item);
      await atomicWrite(productsFile, items);
      return json(res, i >= 0 ? 200 : 201, {item});
    });
  }
  if (route === "/settings" && req.method === "GET")
    return json(res, 200, publicSettings());
  if (route === "/settings" && req.method === "PUT") {
    const body = await readBody(req);
    return serialized(async () => {
      if (body.revision !== settings.revision)
        return json(res, 409, {
          error: "設定已在另一個視窗更新，請重新載入後再修改",
        });
      const next = safeSettings(body);
      next.revision = settings.revision + 1;
      next.updatedAt = new Date().toISOString();
      await atomicWrite(SETTINGS_FILE, next);
      settings = next;
      json(res, 200, publicSettings());
    });
  }
  if (route === "/debug" && req.method === "POST") {
    const body = await readBody(req);
    const config = safeSettings(body.settings || {});
    const messages = body.messages;
    if (
      !Array.isArray(messages) ||
      !messages.length ||
      messages.length > 20 ||
      messages.at(-1)?.role !== "user" ||
      messages.some(
        (m) =>
          !m ||
          !["user", "assistant"].includes(m.role) ||
          typeof m.content !== "string" ||
          !m.content.trim() ||
          m.content.length > 5000,
      )
    )
      return json(res, 400, { error: "調試訊息格式有誤，最多 20 則訊息" });
    const resultRes = {
      destroyed: false,
      writableEnded: false,
      writableFinished: true,
      on() {},
      off() {},
      writeHead() {},
      flushHeaders() {},
      write() {},
      end() {},
    };
    let result;
    await streamReply(
      resultRes,
      messages,
      { ...config, enabled: true },
      async (data) => {
        result = data;
      },
    );
    return json(res, 200, result);
  }
  if (route === "/conversations" && req.method === "GET") {
    const all = [...conversations.values()].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Hong_Kong",
    }).format(new Date());
    const localDate = (date) =>
      new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong" }).format(
        new Date(date),
      );
    const query = (url.searchParams.get("q") || "").toLowerCase().slice(0, 200);
    const filter = url.searchParams.get("filter");
    const matched = all.filter(
      (chat) =>
        (!query ||
          [chat.visitor, chat.notes, ...chat.messages.map((m) => m.content)]
            .join(" ")
            .toLowerCase()
            .includes(query)) &&
        (filter !== "unread" || chat.userVersion > chat.readVersion) &&
        (filter !== "followup" || chat.followUp),
    );
    const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
    return json(res, 200, {
      items: matched.slice(offset, offset + 50).map(summary),
      total: matched.length,
      stats: {
        total: all.length,
        today: all.filter((c) => localDate(c.createdAt) === today).length,
        messages: all.reduce((sum, c) => sum + c.userVersion, 0),
        unread: all.filter((c) => c.userVersion > c.readVersion).length,
        followUp: all.filter((c) => c.followUp).length,
      },
      service: {
        connected: Boolean(
          settings.apiKey && settings.model && settings.enabled,
        ),
        model: settings.model,
        updatedAt: settings.updatedAt,
      },
    });
  }
  const match = route.match(/^\/conversations\/([a-f0-9-]{36})$/);
  if (match) {
    const chat = conversations.get(match[1]);
    if (!chat) return json(res, 404, { error: "找不到對話" });
    if (req.method === "GET") {
      const { visitorId, ...safe } = chat;
      return json(res, 200, safe);
    }
    if (req.method === "PATCH") {
      const body = await readBody(req, 16 * 1024);
      const updated = await updateConversation(chat.id, (draft) => {
        if (Number.isInteger(body.readVersion))
          draft.readVersion = Math.max(
            draft.readVersion,
            Math.min(draft.userVersion, body.readVersion),
          );
        if (typeof body.followUp === "boolean") draft.followUp = body.followUp;
        if (typeof body.notes === "string")
          draft.notes = body.notes.slice(0, 5000);
      });
      return json(res, 200, summary(updated));
    }
  }
  return json(res, 404, { error: "找不到此功能" });
}
