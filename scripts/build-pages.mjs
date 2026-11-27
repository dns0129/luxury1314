import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sampleProducts } from "../backend/products.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const out = path.join(root, "_site");
const prefix = process.argv[2] ?? "/luxury1314";
if (!/^(?:\/[a-zA-Z0-9_.-]+)?$/.test(prefix) || ["/.", "/.."].includes(prefix)) {
  throw new Error("Expected a GitHub Pages repository base path");
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

async function buildDirectory(relative = "") {
  const entries = await readdir(path.join(root, "public", relative), { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const name = path.join(relative, entry.name);
    const source = path.join(root, "public", name);
    const target = path.join(out, name);
    if (entry.isDirectory()) {
      await mkdir(target);
      await buildDirectory(name);
      continue;
    }
    if (!entry.isFile() || !/\.(?:html|css|js|svg|jpg|jpeg|png|webp|ico)$/i.test(name)) {
      throw new Error(`Unexpected public asset: ${name}`);
    }
    if (name.endsWith(".html") || name === "admin/workspace-shell.js") {
      let text = await readFile(source, "utf8");
      // Rebase site-root URLs, including those in the shared navigation template.
      text = text.replace(/(["'])\/(?=admin\/|img\/|styles\.css"|app\.js"|fluid\.js")/g, `$1${prefix}/`);
      text = text.replaceAll('href="/"', `href="${prefix}/"`);
      if (name.endsWith(".html")) text = text.replace("<html ", "<html data-pages-preview ");
      if (name === "admin/index.html") {
        const login = /<div id="loginView"[\s\S]*?(?=<div id="workspace")/;
        if (!login.test(text)) throw new Error("Cannot locate the server login view");
        text = text.replace(login, "").replace('id="workspace" class="workspace" hidden', 'id="workspace" class="workspace"');
      }
      await writeFile(target, text);
    } else {
      await cp(source, target);
    }
  }
}

await buildDirectory();
const config = JSON.parse(await readFile(path.join(root, "live.config.json"), "utf8"));
function facebookUrl(value) {
  if (!value) return "";
  const url = new URL(value);
  if (url.protocol !== "https:" || !/(^|\.)facebook\.com$/.test(url.hostname)) {
    throw new Error("Expected an HTTPS Facebook URL in live.config.json");
  }
  return url.href;
}
const liveUrl = facebookUrl(config.liveNow);
const replays = config.replays.slice(0, 4).map(({ url, title, duration }) => ({
  url: facebookUrl(url), title, duration,
}));
await writeFile(path.join(out, "live.json"), JSON.stringify({
  live: Boolean(liveUrl), liveUrl, pageUrl: facebookUrl(config.pageUrl), replays,
}));
await writeFile(path.join(out, "admin/products/sample-products.json"), JSON.stringify(
  sampleProducts.map(product => ({ ...product, image: prefix + product.image })),
));
