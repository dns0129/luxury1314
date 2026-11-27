import { parseWhatsApp, toRecords } from "./whatsapp-export.js";

const $ = (s) => document.querySelector(s);
const label = {
  whatsapp: "WhatsApp",
  instagram: "Instagram 私訊",
  wechat: "微信私訊",
  peer: "其他同行私訊",
};
const direction = {
  outgoing: "已發出",
  incoming: "已收到",
  found: "已收藏線索",
};
const fmt = new Intl.DateTimeFormat("zh-HK", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Hong_Kong",
});
const pageSize = 30;
let kind = "all",
  offset = 0,
  selectedId = null,
  items = [],
  request = 0;
let demoMode = false,
  inputMode = "file";
let debounce,
  recordBusy = false,
  importing = false,
  fileVersion = 0,
  dataFile;
function node(tag, value, cls) {
  const el = document.createElement(tag);
  if (value != null) el.textContent = value;
  if (cls) el.className = cls;
  return el;
}
async function api(url, body) {
  const res = await fetch(
    "/api/admin/patrol" + url,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : { cache: "no-store" },
  );
  if (res.status === 401) {
    location.replace("/admin/");
    throw Error("請先登入老闆後台。");
  }
  const data = await res.json();
  if (!res.ok) throw Error(data.error || "暫時無法讀取，請再試一次。");
  return data;
}
function buttonAction(text, endpoint, record, message) {
  const b = node("button", text, "button secondary");
  b.type = "button";
  b.onclick = async () => {
    if (recordBusy) return;
    recordBusy = true;
    b.disabled = true;
    try {
      const r = await api(endpoint, { id: record.id });
      $("#notice").textContent = message(r);
      await loadPage();
    } catch (err) {
      $("#notice").textContent = err.message;
    } finally {
      recordBusy = false;
      b.disabled = false;
    }
  };
  return b;
}
function renderReader(item) {
  const view = $("#reader");
  if (!item) {
    $("#inbox").classList.remove("has-selection");
    view.replaceChildren(node("p", "選擇私訊，查看原文及來源。", "list-empty"));
    return;
  }
  const content = node("div", null, "detail-content"),
    head = node("header", null, "detail-header record-header");
  const person = node("div", null, "detail-person"),
    who = node("div");
  const back = node("button", "←", "icon-button mobile-back");
  back.setAttribute("aria-label", "返回訊息列表");
  back.onclick = () => $("#inbox").classList.remove("has-selection");
  who.append(
    node("h2", item.contact),
    node("p", label[item.channel] + " · " + direction[item.kind], "muted"),
  );
  person.append(
    back,
    node("span", item.contact.slice(-2), "visitor-avatar"),
    who,
  );
  const actions = node("div", null, "record-actions");
  if (item.kind !== "found")
    actions.append(
      buttonAction("儲存為線索", "/save-finding", item, (r) =>
        r.added ? "已儲存，可在「已收藏」查看。" : "這則私訊已存為線索。",
      ),
    );
  if (item.channel === "whatsapp" && !item.isPeer)
    actions.append(
      buttonAction(
        "標記為同行私訊",
        "/mark-peer",
        item,
        () => "已標記這則同行私訊。",
      ),
    );
  head.append(person, actions);
  const scroll = node("div", null, "record-scroll");
  const chat = node("div", null, "chat-messages"),
    message = node(
      "article",
      null,
      "chat-message" + (item.kind === "outgoing" ? " user" : ""),
    );
  const author = node("div", null, "message-author");
  author.append(
    node(
      "strong",
      item.author || (item.kind === "outgoing" ? "店舖" : item.contact),
    ),
    node("time", fmt.format(new Date(item.occurredAt))),
  );
  message.append(author, node("p", item.content, "message-bubble"));
  chat.append(message);
  const meta = node("section", null, "record-meta"),
    facts = node("dl", null, "visitor-info");
  for (const [key, value] of [
    ["訊息摘要", item.title],
    ["聯絡人", item.contact],
    ["同行標記", item.isPeer ? "已標記" : "未標記"],
    ["記錄來源", item.source],
    ["來源編號", item.externalId],
  ])
    if (value) facts.append(node("dt", key), node("dd", value));
  meta.append(node("h3", "訊息資料"), facts);
  scroll.append(chat, meta);
  content.append(head, scroll);
  view.replaceChildren(content);
}
function renderRows() {
  const box = $("#results");
  if (!items.length) {
    box.replaceChildren(node("p", "找不到符合條件的私訊。", "list-empty"));
    renderReader(null);
    return;
  }
  if (!items.some((x) => x.id === selectedId)) selectedId = items[0].id;
  const rows = items.map((x) => {
    const row = node(
      "button",
      null,
      "entry conversation-row" + (x.id === selectedId ? " selected" : ""),
    );
    row.type = "button";
    row.setAttribute("aria-pressed", String(x.id === selectedId));
    const body = node("div", null, "row-body"),
      top = node("div", null, "row-top");
    const when = node("time", fmt.format(new Date(x.occurredAt)));
    when.dateTime = x.occurredAt;
    top.append(node("strong", x.contact), when);
    body.append(
      top,
      node("p", x.title, "row-title"),
      node("p", label[x.channel] + " · " + direction[x.kind], "row-preview"),
    );
    if (x.isPeer) body.append(node("span", "同行", "row-tag"));
    row.append(node("span", x.contact.slice(-2), "visitor-avatar"), body);
    row.onclick = () => {
      selectedId = x.id;
      const previous = box.querySelector(".selected");
      previous?.classList.remove("selected");
      previous?.setAttribute("aria-pressed", "false");
      row.classList.add("selected");
      row.setAttribute("aria-pressed", "true");
      renderReader(x);
      $("#inbox").classList.add("has-selection");
    };
    return row;
  });
  box.replaceChildren(...rows);
  renderReader(items.find((x) => x.id === selectedId));
}
async function loadPage(reset = false) {
  if (reset) {
    offset = 0;
    selectedId = null;
  }
  const version = ++request;
  const query = new URLSearchParams({
    channel: $("#channel").value,
    kind,
    q: $("#search").value.trim(),
    offset: String(offset),
  });
  if ($("#peer").checked) query.set("peer", "1");
  try {
    const data = await api("?" + query);
    if (version !== request) return;
    if (offset > 0 && offset >= data.total) {
      offset = Math.max(
        0,
        Math.floor((Math.max(1, data.total) - 1) / pageSize) * pageSize,
      );
      return loadPage();
    }
    items = data.items;
    for (const b of document.querySelectorAll("[data-kind]")) {
      b.setAttribute("aria-pressed", String(b.dataset.kind === kind));
      b.classList.toggle("selected", b.dataset.kind === kind);
      $("#" + b.dataset.kind + "Metric").textContent =
        data.counts[b.dataset.kind] ?? 0;
    }
    demoMode = data.demo;
    $("#mode").textContent = data.demo ? "示例私訊資料" : "店舖私訊記錄";
    const wa = data.channels.find((c) => c.id === "whatsapp");
    $("#connection").textContent = data.demo
      ? "示例資料涵蓋 WhatsApp 及同行私訊。"
      : (wa?.status === "configured"
          ? "WhatsApp 官方接收設定已就緒"
          : "WhatsApp 使用匯入記錄，官方接收尚未設定") +
        "。只記錄 WhatsApp 及同行私訊。";
    $("#range").textContent = data.total
      ? offset + 1 + "–" + (offset + items.length) + " ／ " + data.total + " 則"
      : "0 則";
    $("#prev").disabled = !offset;
    $("#next").disabled = offset + items.length >= data.total;
    $("#import").disabled = false;
    renderRows();
  } catch (err) {
    if (version === request) {
      $("#notice").textContent = err.message;
    }
  }
}
$("#refresh").onclick = () => {
  clearTimeout(debounce);
  loadPage();
};
$("#channel").onchange = $("#peer").onchange = () => loadPage(true);
$("#search").oninput = () => {
  ++request;
  clearTimeout(debounce);
  debounce = setTimeout(() => loadPage(true), 180);
};
for (const b of document.querySelectorAll("[data-kind]"))
  b.onclick = () => {
    kind = b.dataset.kind;
    loadPage(true);
  };
$("#prev").onclick = () => {
  offset = Math.max(0, offset - pageSize);
  loadPage();
};
$("#next").onclick = () => {
  offset += pageSize;
  loadPage();
};
setInterval(() => {
  if (
    !document.hidden &&
    !$("#dialog").open &&
    !recordBusy &&
    offset === 0 &&
    document.activeElement !== $("#search") &&
    !$("#results").contains(document.activeElement)
  )
    loadPage();
}, 20000);

const dlg = $("#dialog");
$("#import").onclick = () => {
  $("#file").value = "";
  $("#preview").textContent = "";
  $("#error").textContent = "";
  $("#contact").value = "";
  $("#peerImport").checked = false;
  $("#options").hidden = true;
  $("#save").disabled = true;
  dataFile = null;
  fileVersion++;
  $("#destination").textContent = demoMode
    ? "匯入至示例私訊記錄。"
    : "匯入至店舖私訊記錄。";
  for (const id of ["noteContact", "noteTime", "noteContent"])
    $("#" + id).value = "";
  setInputMode("file");
  dlg.showModal();
};
$("#close").onclick = () => {
  if (!importing) dlg.close();
};
dlg.addEventListener("cancel", (e) => {
  if (importing) e.preventDefault();
});
function setInputMode(mode) {
  inputMode = mode;
  $("#filePanel").hidden = mode !== "file";
  $("#notePanel").hidden = mode !== "note";
  $("#fileMode").setAttribute("aria-pressed", String(mode === "file"));
  $("#noteMode").setAttribute("aria-pressed", String(mode === "note"));
  $("#save").textContent = mode === "file" ? "確認匯入" : "儲存私訊";
  showPreview();
}
$("#fileMode").onclick = () => setInputMode("file");
$("#noteMode").onclick = () => setInputMode("note");
for (const el of $("#notePanel").querySelectorAll("input,select,textarea"))
  el.addEventListener("input", showPreview);

async function noteRecord() {
  const channel = $("#noteChannel").value,
    kind = $("#noteKind").value,
    contact = $("#noteContact").value.trim(),
    content = $("#noteContent").value.trim();
  const occurredAt = new Date($("#noteTime").value + "+08:00").toISOString();
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      JSON.stringify([channel, contact, occurredAt, content]),
    ),
  );
  const hash = Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  return {
    channel,
    kind,
    contact,
    content,
    occurredAt,
    isPeer: true,
    sourceType: "private_message",
    externalId: "private-note-" + hash,
    title: [...content.split("\n")[0]].slice(0, 60).join(""),
  };
}
function showPreview() {
  $("#save").disabled = true;
  $("#error").textContent = "";
  $("#preview").textContent = "";
  if (inputMode === "note") {
    $("#save").disabled = !(
      $("#noteContact").value.trim() &&
      $("#noteContent").value.trim() &&
      $("#noteTime").validity.valid &&
      Number.isFinite(Date.parse($("#noteTime").value + "+08:00"))
    );
    return;
  }
  if (!dataFile) return;
  try {
    if (dataFile.type === "json") {
      $("#preview").textContent =
        "已讀取 " + dataFile.records.length + " 則結構化記錄。";
    } else {
      const key = $("#order").value + "|" + $("#timezone").value;
      if (dataFile.parseKey !== key) {
        dataFile.parsed = parseWhatsApp(
          dataFile.text,
          $("#order").value,
          $("#timezone").value,
        );
        dataFile.parseKey = key;
      }
      const { rows, omitted } = dataFile.parsed;
      dataFile.rows = rows;
      const self = $("#self"),
        last = self.value,
        names = [...new Set(rows.map((x) => x.author))];
      self.replaceChildren(
        new Option("請選擇發言人", ""),
        new Option("我沒有在這份對話中發言", "none"),
      );
      names.forEach((name, i) => self.add(new Option(name, "user-" + i)));
      if ([...self.options].some((x) => x.value === last)) self.value = last;
      const own = self.value.startsWith("user-")
        ? self.selectedOptions[0].text
        : null;
      const sent = rows.filter((x) => x.author === own).length;
      $("#preview").textContent =
        "共 " +
        rows.length +
        " 則私訊" +
        (self.value
          ? "，已發出 " + sent + " 則、收到 " + (rows.length - sent) + " 則"
          : "") +
        "。" +
        (omitted ? "已略過 " + omitted + " 行系統或媒體提示。" : "");
      if (!self.value || !$("#contact").value.trim()) return;
    }
    $("#save").disabled = false;
  } catch (err) {
    $("#error").textContent = err.message;
  }
}
$("#file").onchange = async () => {
  const version = ++fileVersion,
    file = $("#file").files[0];
  dataFile = null;
  $("#options").hidden = true;
  $("#self").replaceChildren();
  showPreview();
  if (!file) return;
  try {
    if (file.size > 10 * 1024 * 1024)
      throw Error("請選擇 10 MB 以內的文字或 JSON 檔。");
    const text = (await file.text()).replace(/^\uFEFF/, "");
    if (version !== fileVersion) return;
    if (/\.json$/i.test(file.name)) {
      const parsed = JSON.parse(text),
        records = Array.isArray(parsed) ? parsed : parsed?.records;
      if (!Array.isArray(records) || !records.length)
        throw Error("JSON 需包含非空的 records 清單。");
      dataFile = { type: "json", records };
    } else if (/\.txt$/i.test(file.name)) {
      dataFile = { type: "txt", text };
      $("#options").hidden = false;
    } else throw Error("請選擇 .txt 或 .json 檔。");
    showPreview();
  } catch (err) {
    if (version === fileVersion) $("#error").textContent = err.message;
  }
};
for (const id of ["self", "order", "timezone", "contact"])
  $("#" + id).addEventListener(
    id === "contact" || id === "timezone" ? "input" : "change",
    showPreview,
  );
$("#save").onclick = async () => {
  if (importing || (inputMode === "file" && !dataFile)) return;
  importing = true;
  const controls = [...dlg.querySelectorAll("button,input,select,textarea")];
  controls.forEach((el) => (el.disabled = true));
  $("#error").textContent = "";
  let added = 0,
    duplicates = 0,
    done = 0;
  try {
    const self = $("#self");
    let records;
    if (inputMode === "note") records = [await noteRecord()];
    else if (dataFile.type === "json") records = dataFile.records;
    else
      records = await toRecords(
        dataFile.rows,
        $("#contact").value,
        self.value.startsWith("user-") ? self.selectedOptions[0].text : null,
        $("#peerImport").checked,
      );
    // Batch within both the endpoint's row and payload limits.
    let batch = [],
      bytes = 16;
    async function submit() {
      const r = await api("/import", { records: batch });
      added += r.added;
      duplicates += r.duplicates;
      done += batch.length;
      $("#preview").textContent =
        "已處理 " + done + " ／ " + records.length + " 則。";
      batch = [];
      bytes = 16;
    }
    for (const record of records) {
      const size = new TextEncoder().encode(JSON.stringify(record)).length + 1;
      if (batch.length && (batch.length === 200 || bytes + size > 850000))
        await submit();
      batch.push(record);
      bytes += size;
    }
    if (batch.length) await submit();
    dlg.close();
    $("#notice").textContent =
      "已匯入 " + added + " 則；略過 " + duplicates + " 則重複記錄。";
    await loadPage(true);
  } catch (err) {
    $("#error").textContent =
      (done
        ? "已有 " + done + " 則處理完成。可重試，系統會略過重複記錄。"
        : "") + err.message;
  } finally {
    importing = false;
    controls.forEach((el) => (el.disabled = false));
  }
};
loadPage();
