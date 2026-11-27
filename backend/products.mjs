const sampleRows = [
  ["H-001", "Hermès", "Mini Evelyne", "奶茶色 · 銀扣 · U Stamp", "98%", "編織帶、全套配件及單據", "HK$19,500", "在售", "/img/evelyne-1.jpg"],
  ["H-002", "Hermès", "Birkin 25", "杏仁綠 · Togo · 銀扣 · B Stamp", "90%", "全套配件及單據", "詢價", "預留", "/img/birkin25.jpg"],
  ["C-003", "Chanel", "22P Clutch with Chain", "Baby Blue · 淡金扣 · 珍珠鏈條", "", "31 卡、全套配件，無單據", "HK$9,XXX", "待整理", "/img/chanel-1.jpg"],
  ["H-004", "Hermès", "Kelly 28", "Blue Indigo · Epsom · 金扣", "98%", "全套配件及單據", "詢價", "在售", "/img/kelly-3.jpg"],
];
export const sampleProducts = sampleRows.map(([sku, brand, name, details, condition, accessories, price, status, image]) =>
  ({sku, brand, name, details, condition, accessories, price, status, image, revision: 1})
);
const catalogImages = new Set(sampleProducts.map(p => p.image));
const lengths = {sku: 36, brand: 60, name: 100, details: 180, accessories: 180, condition: 80, price: 40};
export function readProduct(body) {
  const item = {};
  for (const [key, max] of Object.entries(lengths)) {
    if (typeof body[key] !== "string" || body[key].length > max) throw new TypeError("商品欄位過長或格式不符");
    item[key] = body[key].trim();
  }
  item.sku = item.sku.toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{0,35}$/.test(item.sku)) throw new TypeError("SKU 請使用字母、數字、連字號或底線");
  if (!item.brand || !item.name) throw new TypeError("請填寫品牌及款式名稱");
  if (!["待整理", "在售", "預留", "已售"].includes(body.status)) throw new TypeError("商品狀態有誤");
  const photo = body.image;
  const isUpload = typeof photo === "string" && photo.length < 700000 && /^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]+=*$/.test(photo);
  if (photo !== "" && !catalogImages.has(photo) && !isUpload) throw new TypeError("請重新選擇商品相片");
  return {...item, status: body.status, image: photo};
}
