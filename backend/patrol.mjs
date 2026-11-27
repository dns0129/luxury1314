const channelNames = new Map([
  ["whatsapp", "WhatsApp"],
  ["instagram", "Instagram"],
  ["wechat", "微信"],
  ["peer", "其他同行私訊"],
]);
const kinds = ["outgoing", "incoming", "found"];
const examples = [
  ["whatsapp", "outgoing", "WA-113", "預約查貨", "收到你的 Birkin 25 看貨查詢，門市同事會先確認現貨。", "2026-11-24T05:03:00.000Z", "示例客人 A", false],
  ["instagram", "found", "IG-410", "同行補貨需求", "我們有客人想找奶茶色 Mini Evelyne，請問有全套配件嗎？", "2026-11-24T04:50:00.000Z", "示例同行 B", true],
  ["wechat", "incoming", "WX-065", "配件查詢", "請問 Kelly 28 有鎖、匙和塵袋嗎？", "2026-11-24T04:46:00.000Z", "示例同行 C", true],
  ["whatsapp", "found", "WA-112", "寄賣詢盤", "有客人想寄賣 Chanel 22P，可以先了解寄賣流程嗎？", "2026-11-24T03:49:00.000Z", "示例同行 D", true],
  ["peer", "outgoing", "PM-064", "寄賣所需資料", "請先提供款式及配件清單，我們再約定驗貨時間。", "2026-11-24T03:25:00.000Z", "示例同行 E", true],
];

function recordId(channel, kind, externalId, origin) {
  return [origin, channel, kind, externalId].join(":");
}

export const demoRecords = examples.map(([channel, kind, externalId, title, content, occurredAt, contact, isPeer]) => ({
  id: recordId(channel, kind, externalId, "demo"), channel, kind, externalId, title, content, occurredAt,
  contact, isPeer, author: "", sourceType: "private_message", demo: true, source: "演示記錄",
}));

function requiredText(value, limit, field) {
  if (typeof value !== "string" || !value.trim() || value.length > limit)
    throw new TypeError(field + " 內容缺失或超出長度限制");
  return value.trim();
}

function timestamp(value) {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value))
    throw new TypeError("occurredAt 需要包含時區的 ISO 日期時間");
  const datePart = value.slice(0, 10);
  const day = new Date(datePart + "T00:00:00Z");
  const time = new Date(value);
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== datePart || !Number.isFinite(time.getTime()))
    throw new TypeError("occurredAt 日期無效");
  return time.toISOString();
}

const importFields = new Set([
  "channel", "kind", "externalId", "title", "content", "occurredAt", "sourceType", "contact", "isPeer", "author", "demo",
]);

export function readPatrolImport(records, demo, official = false) {
  if (!Array.isArray(records) || !records.length || (!official && records.length > 200))
    throw new TypeError("每次需要 1–200 條記錄");
  return records.map((item, i) => {
    try {
      if (!item || Array.isArray(item) || typeof item !== "object") throw new TypeError("需要記錄物件");
      if (Object.keys(item).some(key => !importFields.has(key)))
        throw new TypeError("包含未支援欄位，只可匯入私人通訊記錄");
      if (!channelNames.has(item.channel) || (official && item.channel !== "whatsapp"))
        throw new TypeError("私訊渠道無效");
      if (item.sourceType !== "private_message") throw new TypeError("只可匯入私人通訊記錄");
      if (typeof item.isPeer !== "boolean" || (item.channel !== "whatsapp" && !item.isPeer))
        throw new TypeError("isPeer 需要布林值，WhatsApp 以外的私訊只接受同行");
      if (!kinds.includes(item.kind) || (official && item.kind === "found")) throw new TypeError("記錄類型無效");
      if (item.demo !== undefined && (typeof item.demo !== "boolean" || (item.demo && !demo)))
        throw new TypeError("演示記錄只可匯入演示資料庫");
      const externalId = requiredText(item.externalId, 240, "externalId");
      const contact = requiredText(item.contact, 240, "contact");
      const author = item.author === undefined || item.author === "" ? "" : requiredText(item.author, 240, "author");
      const title = requiredText(item.title, 240, "title");
      const content = requiredText(item.content, 14000, "content");
      const occurredAt = timestamp(item.occurredAt);
      const origin = official ? "whatsapp-api" : "import";
      return {
        id: recordId(item.channel, item.kind, externalId, origin), externalId, channel: item.channel, kind: item.kind,
        contact, isPeer: item.isPeer, author, title, content, occurredAt, sourceType: "private_message", demo,
        source: official ? "WhatsApp 官方回調" : "商戶匯入",
      };
    } catch (error) {
      throw new TypeError("第 " + (i + 1) + " 條：" + error.message);
    }
  });
}

// A stable platform message ID with matching direction, time and content can link an
// imported copy to a webhook event. An export hash or an unrelated ID cannot.
function verifiedWhatsAppKey(item) {
  return item.channel === "whatsapp" && item.externalId.startsWith("wamid.") && !item.demo
    ? JSON.stringify([item.kind, item.externalId, item.occurredAt, item.content])
    : null;
}

export function addPatrolRecords(existing, incoming) {
  const ids = new Set(existing.flatMap(item => [item.id, ...(item.mergedIds || [])]));
  const officialKeys = new Map();
  const exportDirections = new Map();
  const isExportMessage = item => item.channel === "whatsapp" && item.kind !== "found" && item.externalId.startsWith("wa-export-");
  const items = [...existing];
  let added = 0;
  let changed = false;
  for (const [i, item] of items.entries()) {
    if (isExportMessage(item)) exportDirections.set(item.externalId, item.kind);
    const key = verifiedWhatsAppKey(item);
    if (key) officialKeys.set(key, i);
  }
  for (const item of incoming) {
    if (isExportMessage(item)) {
      const direction = exportDirections.get(item.externalId);
      if (direction && direction !== item.kind)
        throw new TypeError("同一條 WhatsApp 匯出訊息的收發方向有衝突，請核對「我在對話中的名稱」後再匯入；本批未儲存。");
      exportDirections.set(item.externalId, item.kind);
    }
    if (ids.has(item.id)) continue;
    const key = verifiedWhatsAppKey(item);
    if (key && officialKeys.has(key)) {
      const index = officialKeys.get(key);
      const prev = items[index];
      // Preserve the verified source and merchant-provided peer/contact annotations.
      const verified = item.source === "WhatsApp 官方回調" ? item : prev;
      const imported = item.source === "商戶匯入" ? item : prev;
      items[index] = {
        ...verified, mergedIds: [imported.id],
        contact: imported.contact, isPeer: prev.isPeer || item.isPeer, author: imported.author || verified.author,
      };
      changed = true;
    } else {
      if (key) officialKeys.set(key, items.length);
      items.push(item);
      added++;
      changed = true;
    }
    ids.add(item.id);
  }
  return {items, changed, added, duplicates: incoming.length - added};
}

export function savePatrolFinding(records, id) {
  const recordId = requiredText(id, 512, "id");
  const original = records.find(item => item.id === recordId || item.mergedIds?.includes(recordId));
  if (!original) return null;
  if (original.kind === "found") throw new TypeError("請選擇原來的收到或發出私訊");
  const knownIds = new Set([original.id, ...(original.mergedIds || [])]);
  if (records.some(item => item.kind === "found" && knownIds.has(item.originId)))
    return {added: false, items: records};
  const finding = {
    id: "finding:" + original.id, externalId: original.externalId, originId: original.id,
    channel: original.channel, kind: "found", sourceType: "private_message", source: "已收藏私訊", demo: original.demo,
    contact: original.contact, isPeer: original.isPeer, author: original.author, title: original.title,
    content: original.content, occurredAt: original.occurredAt,
  };
  return {added: true, items: records.concat(finding)};
}

export function markPatrolPeer(records, id) {
  const recordId = requiredText(id, 512, "id");
  const target = records.find(item => item.id === recordId || item.mergedIds?.includes(recordId));
  if (!target) return null;
  if (target.channel !== "whatsapp") throw new TypeError("只可標記 WhatsApp 私訊");
  const original = target.originId
    ? records.find(item => item.id === target.originId || item.mergedIds?.includes(target.originId))
    : target;
  const knownIds = new Set([target.id, original?.id, ...(original?.mergedIds || [])].filter(Boolean));
  let changed = false;
  const items = records.map(item => {
    if (item.isPeer || (!knownIds.has(item.id) && !knownIds.has(item.originId))) return item;
    changed = true;
    return {...item, isPeer: true};
  });
  return {changed, items};
}

export function patrolFeed(all, params, demo, webhookConfigured) {
  const channel = params.get("channel") || "all";
  const kind = params.get("kind") || "all";
  const peer = params.get("peer") || "0";
  const offset = Number(params.get("offset") || 0);
  if (channel !== "all" && !channelNames.has(channel)) throw new TypeError("渠道無效");
  if (kind !== "all" && !kinds.includes(kind)) throw new TypeError("記錄類型無效");
  if (!["0", "1"].includes(peer)) throw new TypeError("同行篩選值無效");
  if (!Number.isSafeInteger(offset) || offset < 0) throw new TypeError("分頁位置無效");
  const q = (params.get("q") || "").trim().toLowerCase();
  if (q.length > 200) throw new TypeError("搜尋最多可用 200 個字元");
  const channels = [...channelNames].map(([id, label]) => {
    const count = all.reduce((num, item) => num + Number(item.channel === id), 0);
    const configured = !demo && id === "whatsapp" && webhookConfigured;
    const status = demo ? "demo" : configured ? "configured" : count ? "imported" : "offline";
    return {id, label, status, count};
  });
  const counts = {all: 0, outgoing: 0, incoming: 0, found: 0};
  const matches = [];
  for (const item of all) {
    if (channel !== "all" && item.channel !== channel) continue;
    if (peer === "1" && !item.isPeer) continue;
    if (q && ![item.contact, item.author, item.title, item.content, item.externalId, item.source, channelNames.get(item.channel)]
      .some(s => s?.toLowerCase().includes(q))) continue;
    counts.all++;
    counts[item.kind]++;
    if (kind === "all" || item.kind === kind) matches.push(item);
  }
  matches.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || a.id.localeCompare(b.id));
  return {items: matches.slice(offset, offset + 30), total: matches.length, counts, channels, demo};
}
