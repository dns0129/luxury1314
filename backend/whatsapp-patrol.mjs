import { createHmac, timingSafeEqual } from "node:crypto";

const WEBHOOK_BODY_LIMIT = 3 * 1024 * 1024;

export function isWhatsAppPatrolConfigured() {
  return process.env.PATROL_DEMO !== "1" &&
    Boolean(process.env.WHATSAPP_PATROL_APP_SECRET?.trim()) &&
    Boolean(process.env.WHATSAPP_PATROL_VERIFY_TOKEN?.trim()) &&
    /^\d+$/.test(process.env.WHATSAPP_PATROL_PHONE_NUMBER_ID || "");
}

function respond(res, status, message = "") {
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(message);
}

function signatureMatches(raw, header) {
  if (typeof header !== "string" || !/^sha256=[0-9a-f]{64}$/i.test(header)) return false;
  const expected = createHmac("sha256", process.env.WHATSAPP_PATROL_APP_SECRET).update(raw).digest();
  return timingSafeEqual(expected, Buffer.from(header.slice(7), "hex"));
}

function messageRecord(message, contacts, outgoing) {
  if (!message || message.group_id || message.recipient_type === "group") return null;
  const userId = outgoing ? message.to_user_id : message.from_user_id;
  const phone = outgoing ? message.to : message.from;
  const identity = userId || phone;
  if (typeof identity !== "string" || !identity || identity.length > 160) return null;
  const person = contacts.find(person =>
    (userId && person?.user_id === userId) || (phone && person?.wa_id === phone)
  );
  const name = person?.profile?.name || person?.profile?.username;
  const label = typeof name === "string" && name.trim() ? name.trim() : "";
  const shownId = typeof phone === "string" && phone ? phone : identity;
  const contact = label ? (label + " · " + shownId).slice(0, 240) : shownId;
  let content;
  if (message.type === "text") content = message.text?.body;
  if (["image", "video", "document"].includes(message.type)) content = message[message.type]?.caption;
  if (typeof content !== "string" || !content.trim() || content.length > 14000) return null;
  if (typeof message.id !== "string" || !message.id.trim() || message.id.length > 240) return null;
  if (!/^\d{1,11}$/.test(String(message.timestamp))) return null;
  return {
    channel: "whatsapp", kind: outgoing ? "outgoing" : "incoming",
    sourceType: "private_message", isPeer: false, contact,
    externalId: message.id,
    title: Array.from(content.trim().replace(/\s+/g, " ")).slice(0, 70).join(""),
    content, occurredAt: new Date(Number(message.timestamp) * 1000).toISOString(),
  };
}

function recordsFromPayload(payload) {
  const records = [];
  if (payload?.object !== "whatsapp_business_account" || !Array.isArray(payload.entry)) return records;
  for (const entry of payload.entry) {
    if (!Array.isArray(entry?.changes)) continue;
    for (const change of entry.changes) {
      const value = change?.value;
      if (value?.messaging_product !== "whatsapp" ||
          value.metadata?.phone_number_id !== process.env.WHATSAPP_PATROL_PHONE_NUMBER_ID) continue;
      const outgoing = change.field === "smb_message_echoes";
      if (!outgoing && change.field !== "messages") continue;
      const messages = outgoing ? value.message_echoes : value.messages;
      if (!Array.isArray(messages)) continue;
      const contacts = Array.isArray(value.contacts) ? value.contacts : [];
      for (const message of messages) {
        const record = messageRecord(message, contacts, outgoing);
        if (record) records.push(record);
      }
    }
  }
  return records;
}

export async function handleWhatsAppPatrol(req, res, url, storeRecords) {
  if (!isWhatsAppPatrolConfigured()) return respond(res, 404);
  if (req.method === "GET") {
    const q = url.searchParams;
    if (q.get("hub.mode") !== "subscribe" ||
        q.get("hub.verify_token") !== process.env.WHATSAPP_PATROL_VERIFY_TOKEN ||
        !q.get("hub.challenge")) return respond(res, 403);
    return respond(res, 200, q.get("hub.challenge"));
  }
  if (req.method !== "POST") return respond(res, 405);

  const parts = [];
  let length = 0;
  for await (const part of req) {
    length += part.length;
    if (length > WEBHOOK_BODY_LIMIT) return respond(res, 413);
    parts.push(part);
  }
  const raw = Buffer.concat(parts, length);
  if (!signatureMatches(raw, req.headers["x-hub-signature-256"])) return respond(res, 403);
  let payload;
  try {
    payload = JSON.parse(raw.toString("utf8"));
  } catch {
    return respond(res, 400);
  }
  const records = recordsFromPayload(payload);
  // Reply only after persistence. If a later batch fails, Meta's retry is deduplicated by message ID.
  for (let start = 0; start < records.length; start += 200) {
    await storeRecords(records.slice(start, start + 200));
  }
  return respond(res, 200, "EVENT_RECEIVED");
}
