const $ = (selector) => document.querySelector(selector);
const preview = document.documentElement.hasAttribute("data-pages-preview");
let products = [];
let selected = "";
let snapshot = null;

function element(tag, value, className) {
  const node = document.createElement(tag);
  if (value) node.textContent = value;
  if (className) node.className = className;
  return node;
}
function image(item, className) {
  if (!item.image) return element("span", "待補相片", className + " no-photo");
  const photo = element("img", "", className);
  photo.src = item.image;
  photo.alt = item.brand + " " + item.name;
  return photo;
}
async function api(options) {
  if (preview) {
    if (options) throw Error("公開預覽僅供瀏覽。");
    const response = await fetch("./sample-products.json");
    if (!response.ok) throw Error("無法載入示例商品。");
    return { items: await response.json(), demo: true };
  }
  const response = await fetch("/api/admin/products", options);
  if (response.status === 401) {
    location.replace("/admin/");
    throw Error("請先登入");
  }
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "無法讀取商品");
  return data;
}
function renderDetail(item) {
  const panel = $("#detail");
  if (!item) {
    $("#inbox").classList.remove("has-selection");
    panel.replaceChildren(
      element("p", "選擇商品，查看相片及貨品資料。", "list-empty"),
    );
    return;
  }
  const content = element("div", "", "detail-content");
  const head = element("header", "", "detail-header");
  const back = element("button", "←", "icon-button mobile-back");
  back.setAttribute("aria-label", "返回商品列表");
  back.onclick = () => {
    $("#inbox").classList.remove("has-selection");
  };
  const person = element("div", "", "detail-person");
  const title = element("div");
  title.append(
    element("h2", item.name),
    element("p", item.brand + " · " + item.sku, "muted"),
  );
  person.append(back, title);
  const edit = element("button", "編輯商品", "button secondary");
  edit.disabled = preview;
  edit.onclick = () => editProduct(item);
  head.append(person, edit);
  const body = element("div", "", "product-body");
  const list = element("dl", "", "visitor-info");
  const rows = [
    ["商品狀態", item.status],
    ["公開標價", item.price],
    ["貨品規格", item.details],
    ["成色", item.condition],
    ["配件及單據", item.accessories],
  ];
  for (const [k, v] of rows)
    list.append(element("dt", k), element("dd", v || "待補"));
  const missing = [["商品相片", item.image], ...rows.slice(1)]
    .filter(([, v]) => !v)
    .map(([k]) => k);
  body.append(
    image(item, "product-photo"),
    list,
    element(
      "p",
      missing.length ? "資料待補：" + missing.join("、") : "資料齊備",
      "field-help",
    ),
  );
  content.append(head, body);
  panel.replaceChildren(content);
}
function render() {
  const query = $("#search").value.trim().toLocaleLowerCase(),
    status = $("#filter").value;
  const items = products.filter(
    (item) =>
      (!status || item.status === status) &&
      [item.sku, item.name, item.brand, item.details].some((t) =>
        t.toLocaleLowerCase().includes(query),
      ),
  );
  const active = items.find((item) => item.sku === selected) || items[0];
  selected = active?.sku || "";
  const rows = items.map((item) => {
    const row = element(
      "button",
      "",
      "row conversation-row" + (item === active ? " selected" : ""),
    );
    row.type = "button";
    row.setAttribute("aria-pressed", String(item === active));
    const description = element("div", "", "row-body"),
      top = element("div", "", "row-top");
    top.append(element("strong", item.brand), element("time", item.sku));
    description.append(
      top,
      element("p", item.name, "row-title"),
      element("p", item.price || "標價待補", "row-preview"),
      element("span", item.status, "row-tag"),
    );
    row.append(image(item, "product-list-photo"), description);
    row.onclick = () => {
      selected = item.sku;
      render();
      $("#inbox").classList.add("has-selection");
      if (!matchMedia("(max-width:650px)").matches)
        $("#list .selected")?.focus({ preventScroll: true });
    };
    return row;
  });
  $("#count").textContent = items.length + " / " + products.length + " 件商品";
  $("#list").replaceChildren(
    ...(rows.length
      ? rows
      : [
          element(
            "p",
            products.length
              ? "找不到符合條件的商品。"
              : "尚未有商品，可按「新增商品」開始。",
            "list-empty",
          ),
        ]),
  );
  $("#totalMetric").textContent = products.length;
  for (const [id, status] of [
    ["availableMetric", "在售"],
    ["heldMetric", "預留"],
    ["pendingMetric", "待整理"],
  ])
    $("#" + id).textContent = products.filter(
      (p) => p.status === status,
    ).length;
  renderDetail(active);
}
function editProduct(item = null) {
  snapshot = item;
  const form = $("#form");
  form.reset();
  for (const key of [
    "sku",
    "status",
    "brand",
    "name",
    "details",
    "condition",
    "accessories",
    "price",
  ]) {
    form.elements[key].value =
      item?.[key] || (key === "status" ? "待整理" : "");
  }
  form.elements.sku.readOnly = Boolean(item);
  $("#editTitle").textContent = item ? "編輯商品" : "新增商品";
  $("#formError").textContent = "";
  $("#editor").showModal();
}
async function resizePhoto(file) {
  if (file.size > 15 * 1024 * 1024) throw Error("請選擇 15 MB 以內的商品相片");
  const bitmap = await createImageBitmap(file).catch(() => {
    throw Error("這張相片無法開啟，請選擇 JPG、PNG 或 WebP");
  });
  try {
    const factor = Math.min(1, 900 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * factor));
    canvas.height = Math.max(1, Math.round(bitmap.height * factor));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.75);
  } finally {
    bitmap.close();
  }
}
$("#create").addEventListener("click", () => editProduct());
$("#cancel").addEventListener("click", () => $("#editor").close());
$("#editor").addEventListener("cancel", (event) => {
  if ($("#save").disabled) event.preventDefault();
});
$("#search").addEventListener("input", render);
$("#filter").addEventListener("change", render);
$("#form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = $("#save");
  const original = snapshot;
  submit.disabled = true;
  $("#cancel").disabled = true;
  try {
    const data = Object.fromEntries(new FormData(form));
    const photo = data.photo;
    delete data.photo;
    data.image = photo.size ? await resizePhoto(photo) : original?.image || "";
    if (original) data.revision = original.revision;
    const result = await api({
      method: original ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const index = products.findIndex((item) => item.sku === result.item.sku);
    if (index < 0) products.push(result.item);
    else products[index] = result.item;
    selected = result.item.sku;
    $("#search").value = "";
    $("#filter").value = "";
    $("#notice").textContent = selected + " 已儲存";
    $("#editor").close();
    render();
  } catch (error) {
    $("#formError").textContent = error.message;
  } finally {
    submit.disabled = false;
    $("#cancel").disabled = false;
  }
});
api()
  .then((data) => {
    products = data.items;
    $("#mode").textContent = data.demo ? "示例商品資料" : "門市商品資料";
    $("#create").disabled = preview;
    render();
  })
  .catch((error) => {
    $("#notice").textContent = error.message;
  });
