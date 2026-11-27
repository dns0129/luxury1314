// WhatsApp creates different text headers for iOS and Android. Parse the
// exported local time using the date order and offset confirmed by the owner.
const start =
  /^(?:\[)?(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})[,，]?\s+(?:(上午|下午|凌晨|早上|晚上)\s*)?(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?(?:\]\s*|\s+-\s+)(.*)$/i;
const mediaOnly =
  /^(?:<Media omitted>|image omitted|video omitted|audio omitted|sticker omitted|document omitted|此訊息已刪除|<省略媒體>|<媒體已略>|<媒体文件已省略>)$/i;

function localInstant(match, order, offset) {
  const [, a, b, c, marker, hour, min, seconds, english] = match;
  let day, month, year;
  if (a.length === 4 || order === "ymd")
    [year, month, day] = [a, b, c].map(Number);
  else
    [day, month, year] = (order === "mdy" ? [b, a, c] : [a, b, c]).map(Number);
  if (year < 100) year += 2000;
  let h = Number(hour);
  const m = Number(min),
    s = Number(seconds || 0);
  if (english || marker) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (/^(pm|下午|晚上)$/i.test(english || marker) ? 12 : 0);
  }
  const date = new Date(Date.UTC(year, month - 1, day, h, m, s));
  if (
    year < 1970 ||
    year > 2100 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    h > 23 ||
    m > 59 ||
    s > 59
  )
    return null;
  return new Date(date.getTime() - offset * 60000).toISOString();
}

export function parseWhatsApp(text, order, zone) {
  const m = /^([+-])(\d{2}):(\d{2})$/.exec(zone.trim());
  if (
    !m ||
    Number(m[2]) > 14 ||
    Number(m[3]) > 59 ||
    (Number(m[2]) === 14 && Number(m[3]) !== 0)
  )
    throw Error("請填有效的 UTC 時差，例如 +08:00。");
  const offset = (Number(m[2]) * 60 + Number(m[3])) * (m[1] === "-" ? -1 : 1);
  const rows = [];
  let current = null,
    omitted = 0,
    invalid = 0;
  for (const sourceLine of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = sourceLine
      .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
      .replace(/[\u202f\u00a0]/g, " ");
    const match = start.exec(line);
    if (!match) {
      if (current) current.content += "\n" + line;
      else if (line.trim()) omitted++;
      continue;
    }
    current = null;
    const author = /^(.{1,150}?):\s+([\s\S]*)$/.exec(match[9]);
    if (!author) {
      omitted++;
      continue;
    }
    const occurredAt = localInstant(match, order, offset);
    if (!occurredAt) {
      invalid++;
      continue;
    }
    if (mediaOnly.test(author[2].trim())) {
      omitted++;
      continue;
    }
    current = { author: author[1].trim(), content: author[2], occurredAt };
    rows.push(current);
  }
  for (const row of rows) row.content = row.content.trim();
  if (invalid)
    throw Error(
      "有 " + invalid + " 則日期無效。請檢查日期順序及原檔後再匯入。",
    );
  if (!rows.length)
    throw Error(
      "找不到有日期、發言人和正文的 WhatsApp 私訊。請選擇匯出的 .txt 聊天檔。",
    );
  return { rows, omitted };
}

export async function toRecords(rows, contact, self, isPeer) {
  const copies = new Map(),
    result = [];
  for (const row of rows) {
    const key = JSON.stringify([
      contact.trim(),
      row.occurredAt,
      row.author,
      row.content,
    ]);
    const n = copies.get(key) || 0;
    copies.set(key, n + 1);
    const bytes = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(JSON.stringify([key, n])),
    );
    const digest = Array.from(new Uint8Array(bytes), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    result.push({
      ...row,
      channel: "whatsapp",
      sourceType: "private_message",
      contact: contact.trim(),
      isPeer,
      externalId: "wa-export-" + digest,
      kind: row.author === self ? "outgoing" : "incoming",
      title: [...row.content.split("\n")[0]].slice(0, 60).join(""),
    });
  }
  return result;
}
