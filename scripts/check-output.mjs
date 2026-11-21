/**
 * 产物自检 —— 对 out/ 的真实 HTML 做断言。
 *
 * 这些不变量都对应过去真实存在的缺陷，用产物级检查钉住，避免回退：
 *  1. 曾有 22 个路由（含 /chapters、/concepts、/quotes、/fables、/timeline）
 *     因根布局继承 alternates.canonical 而声明「canonical = 首页」，
 *     等于自报为首页副本，会被搜索引擎判重去索引。
 *  2. 曾有 15 个 "use client" 路由拿不到自己的 title，全站共用首页标题。
 *  3. sitemap 的 URL 无尾斜杠，而站点 trailingSlash: true 实际提供带斜杠地址，
 *     每条都要吃一次 308 跳转，并与 canonical 自相矛盾。
 *  4. 结构化数据里 datePublished 是未来日期（2026-07-29）。
 *  5. manifest 引用了不存在的图标文件。
 *
 * 运行：node scripts/check-output.mjs
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "out");

if (!existsSync(OUT)) {
  console.error("未找到 out/ —— 请先执行 npm run build");
  process.exit(1);
}

const problems = [];
const note = (msg) => problems.push(msg);

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = walk(OUT);
const pages = files.filter((f) => f.endsWith("index.html"));

// ── 1 & 2：canonical 与 title ──
const SITE = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") || "https://zhuangzi-site.pages.dev";
const HOME_CANONICAL = `${SITE}/`;

let genericTitle = 0;
let homeCanonical = 0;
let missingCanonical = 0;
const DEFAULT_TITLE = "莊子 · 逍遥游于无何有之乡";

for (const file of pages) {
  const html = readFileSync(file, "utf8");
  let route = "/" + relative(OUT, dirname(file)).replace(/\\/g, "/");
  if (route === "/.") route = "/";

  const title = /<title>(.*?)<\/title>/s.exec(html)?.[1] ?? "";
  const canonical = /<link rel="canonical" href="([^"]*)"/.exec(html)?.[1] ?? "";
  const isNoIndex = /name="robots"[^>]*content="[^"]*noindex/.test(html);

  // 错误页 / SW 离线兜底页不需要 canonical，但必须是 noindex
  const isErrorPage = route === "/404" || route === "/_not-found" || route === "/offline";
  if (isErrorPage) {
    if (!isNoIndex) note(`${route}: 错误页应声明 noindex`);
  } else if (!canonical) {
    missingCanonical++;
    note(`${route}: 缺少 canonical`);
  } else if (canonical === HOME_CANONICAL && route !== "/") {
    homeCanonical++;
    note(`${route}: canonical 指向首页（会被判重去索引）`);
  } else if (canonical && !canonical.endsWith("/")) {
    note(`${route}: canonical 缺尾斜杠（与 trailingSlash 设置不一致）— ${canonical}`);
  }

  if (title === DEFAULT_TITLE && route !== "/") {
    genericTitle++;
    note(`${route}: 使用了站点默认标题，缺少本页专属 title`);
  }
  if (!title) note(`${route}: 缺少 <title>`);
}

// ── 3：sitemap ──
const sitemapPath = join(OUT, "sitemap.xml");
if (!existsSync(sitemapPath)) {
  note("缺少 sitemap.xml");
} else {
  const xml = readFileSync(sitemapPath, "utf8");
  const locs = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
  if (locs.length === 0) note("sitemap.xml 内没有任何 <loc>");
  const noSlash = locs.filter((u) => !u.endsWith("/"));
  if (noSlash.length) {
    note(`sitemap 有 ${noSlash.length} 条 URL 缺尾斜杠，例如 ${noSlash[0]}`);
  }
  // sitemap 不应收录 noindex 页面（Search Console 会报「已提交但被排除」）
  const shouldNotBeListed = locs.filter((u) =>
    /\/(search|bookmarks|annotations|report|cards|reading-path)\/$/.test(u)
  );
  if (shouldNotBeListed.length) {
    note(`sitemap 收录了 noindex 页面: ${shouldNotBeListed.join(", ")}`);
  }
  // 每条 sitemap URL 都应有对应的实际产物
  for (const loc of locs) {
    const rel = loc.replace(SITE, "").replace(/^\/|\/$/g, "");
    const target = rel ? join(OUT, rel, "index.html") : join(OUT, "index.html");
    if (!existsSync(target)) note(`sitemap 中的 ${loc} 没有对应产物`);
  }
}

// ── 4：结构化数据日期 ──
const today = new Date().toISOString().slice(0, 10);
for (const file of pages.slice(0, 400)) {
  const html = readFileSync(file, "utf8");
  for (const m of html.matchAll(/"date(?:Published|Modified)":"(\d{4}-\d{2}-\d{2})/g)) {
    if (m[1] > today) {
      const route = "/" + relative(OUT, dirname(file)).replace(/\\/g, "/");
      note(`${route}: 结构化数据含未来日期 ${m[1]}`);
      break;
    }
  }
}

// ── 5：manifest 图标存在性 ──
const manifestPath = join(OUT, "manifest.json");
if (!existsSync(manifestPath)) {
  note("缺少 manifest.json");
} else {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  for (const icon of manifest.icons ?? []) {
    const p = join(OUT, icon.src.replace(/^\//, ""));
    if (!existsSync(p)) note(`manifest 引用了不存在的图标: ${icon.src}`);
    else if (statSync(p).size < 1024 && icon.type !== "image/svg+xml") {
      note(`manifest 图标 ${icon.src} 仅 ${statSync(p).size}B，疑似空白占位图`);
    }
  }
  if (!(manifest.icons ?? []).some((i) => (i.purpose ?? "").includes("maskable"))) {
    note("manifest 缺少 maskable 图标（影响 Android 安装图标质量）");
  }
  for (const key of ["id", "scope", "lang", "start_url", "theme_color", "background_color"]) {
    if (!manifest[key]) note(`manifest 缺少 ${key}`);
  }
}

// ── 6：robots.txt ──
const robotsPath = join(OUT, "robots.txt");
if (!existsSync(robotsPath)) note("缺少 robots.txt");
else if (!readFileSync(robotsPath, "utf8").includes("Sitemap:")) {
  note("robots.txt 未声明 Sitemap");
}

// ── 7：Service Worker 版本号已替换 ──
const swPath = join(OUT, "sw.js");
if (!existsSync(swPath)) note("缺少 sw.js");
else {
  const sw = readFileSync(swPath, "utf8");
  if (/zhuangzi-[a-z]+-v\d+\b/.test(sw)) {
    note("sw.js 的缓存版本号仍是 v1 —— bump-sw-version.mjs 未生效，部署后旧缓存不会失效");
  }
}

// ── 8：robots.txt 不得屏蔽 noindex 页面 ──
// 被 Disallow 的页面爬虫读不到其中的 noindex，反而可能以无标题条目被索引。
const robotsTxt = existsSync(robotsPath) ? readFileSync(robotsPath, "utf8") : "";
const disallowed = [...robotsTxt.matchAll(/^Disallow:\s*(\S+)/gim)].map((m) => m[1]);
const noindexRoutes = [];
for (const file of pages) {
  const html = readFileSync(file, "utf8");
  if (!/name="robots"[^>]*content="[^"]*noindex/.test(html)) continue;
  const rel = relative(OUT, dirname(file)).replace(/\\/g, "/");
  const route = rel ? `/${rel}/` : "/";
  noindexRoutes.push(route);
  const blocker = disallowed.find((d) => route.startsWith(d));
  if (blocker) note(`${route}: 同时被 robots.txt Disallow(${blocker}) 与 noindex —— noindex 将读不到`);
}
if (existsSync(sitemapPath)) {
  const xml = readFileSync(sitemapPath, "utf8");
  for (const route of noindexRoutes) {
    if (xml.includes(`<loc>${SITE}${route}</loc>`)) note(`sitemap 收录了 noindex 页面 ${route}`);
  }
}

// ── 9：站内链接与分享图都必须有对应产物 ──
const fileSet = new Set(files.map((f) => "/" + relative(OUT, f).replace(/\\/g, "/")));
const resolves = (path) => {
  let p = path;
  try {
    p = decodeURIComponent(path);
  } catch {
    return false;
  }
  if (p.endsWith("/")) return fileSet.has(`${p}index.html`);
  return fileSet.has(p) || fileSet.has(`${p}/index.html`) || fileSet.has(`${p}.html`);
};
const brokenLinks = new Map();
const brokenAnchors = new Set();
let missingOg = 0;
for (const file of pages) {
  const html = readFileSync(file, "utf8");
  const route = "/" + relative(OUT, dirname(file)).replace(/\\/g, "/");
  // 只看真实 DOM 属性（RSC 载荷里的 href 是 \" 转义过的，不会被这条正则匹配）
  for (const m of html.matchAll(/<(?:a|link|script|img)\b[^>]*?\s(?:href|src)="(\/[^"#?]*)/g)) {
    const target = m[1];
    if (target.startsWith("//") || target.startsWith("/api/")) continue;
    if (!resolves(target) && !brokenLinks.has(target)) brokenLinks.set(target, route);
  }
  // 页内锚点：<a href="#x"> 必须在同页有 id="x"（曾因正文改走 StaticBlock 丢过 #chapter-conclusion）
  for (const m of html.matchAll(/<a\b[^>]*?\shref="#([^"]+)"/g)) {
    let id = m[1];
    try {
      id = decodeURIComponent(id);
    } catch {
      /* 保持原样比对 */
    }
    if (!html.includes(` id="${id}"`)) {
      const key = `${route}#${id}`;
      brokenAnchors.add(key);
    }
  }
  for (const m of html.matchAll(/<meta (?:property="og:image"|name="twitter:image") content="([^"]+)"/g)) {
    const url = m[1];
    if (!url.startsWith(SITE)) continue;
    if (!resolves(url.slice(SITE.length))) {
      missingOg++;
      note(`${route}: 分享图不存在 ${url}`);
    }
  }
}
for (const [target, route] of brokenLinks) note(`站内断链 ${target}（首见于 ${route}）`);
for (const a of brokenAnchors) note(`页内锚点无目标 ${a}`);

// ── 10：Cloudflare Pages 配置文件的硬限制 ──
const headersPath = join(OUT, "_headers");
if (!existsSync(headersPath)) note("缺少 _headers（安全头与缓存策略不会生效）");
else {
  const lines = readFileSync(headersPath, "utf8").split("\n");
  const rules = lines.filter((l) => /^\S/.test(l) && !l.startsWith("#"));
  if (rules.length > 100) note(`_headers 有 ${rules.length} 条规则，超过 Pages 上限 100`);
  const long = lines.find((l) => l.length > 2000);
  if (long) note(`_headers 存在超过 2000 字符的行（Pages 会忽略）: ${long.slice(0, 40)}…`);
  const dup = rules.filter((r, i) => rules.indexOf(r) !== i);
  if (dup.length) note(`_headers 路径规则重复: ${[...new Set(dup)].join(", ")}`);
  if (!lines.some((l) => /^\s+Content-Security-Policy:/.test(l))) note("_headers 缺少 Content-Security-Policy");
}
const redirectsPath = join(OUT, "_redirects");
if (existsSync(redirectsPath)) {
  for (const line of readFileSync(redirectsPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const status = t.split(/\s+/)[2];
    if (status && !["200", "301", "302", "303", "307", "308"].includes(status)) {
      note(`_redirects 规则状态码 ${status} 不被 Pages 支持（整条会被忽略）: ${t}`);
    }
  }
}

// ── 10b：标了 immutable 的字体分片必须文件名带内容哈希 ──
const slices = files
  .map((f) => "/" + relative(OUT, f).replace(/\\/g, "/"))
  .filter((f) => f.startsWith("/fonts/slices/") && f.endsWith(".woff2"));
const unhashedSlices = slices.filter((f) => !/\.[0-9a-f]{8,}\.woff2$/.test(f));
const slicesImmutable =
  existsSync(headersPath) &&
  /^\/fonts\/slices\/\*\n(?:[ \t]+.*\n)*?[ \t]+Cache-Control:.*immutable/m.test(readFileSync(headersPath, "utf8"));
let sliceWarning = "";
if (slicesImmutable && unhashedSlices.length) {
  if (unhashedSlices.length === slices.length) {
    // 字体改名（加哈希）在另一条分支上，合并前这里全部未带哈希：只提示，不失败
    sliceWarning = `⚠️  /fonts/slices/* 已配 immutable，但 ${slices.length} 个分片文件名都不带内容哈希（合并字体改名后应消失）`;
  } else {
    note(`/fonts/slices/ 下有 ${unhashedSlices.length} 个未带哈希的分片却被标为 immutable: ${unhashedSlices[0]}`);
  }
}

// ── 10c：按需 JSON 不应出现在 sitemap 里 ──
if (existsSync(sitemapPath) && /<loc>[^<]*\.json<\/loc>/.test(readFileSync(sitemapPath, "utf8"))) {
  note("sitemap 收录了 .json 路径");
}

// ── 10d：每页 CSP meta 里的 script hash 与页面内联脚本一一对应 ──
// 刻意不复用 inject-csp-meta.mjs 的解析函数：这里用另一种写法（顺序扫描）复算，
// 两边任何一边解析有偏差都会在这里对不上。浏览器端的最终验证在 scripts/smoke.mjs。
function executableInlineHashes(html) {
  const hashes = new Set();
  let pos = 0;
  for (;;) {
    const open = html.indexOf("<script", pos);
    if (open < 0) break;
    const tagEnd = html.indexOf(">", open);
    const close = html.indexOf("</script>", tagEnd);
    if (tagEnd < 0 || close < 0) break;
    const attrs = html.slice(open + 7, tagEnd);
    const body = html.slice(tagEnd + 1, close);
    pos = close + 9;
    if (/\ssrc\s*=/.test(attrs) || body === "") continue;
    const type = (/\stype\s*=\s*["']?([^"'\s>]*)/.exec(attrs)?.[1] ?? "").toLowerCase();
    if (type && !["text/javascript", "application/javascript", "module"].includes(type)) continue;
    const text = body.replace(/\r\n?/g, "\n");
    hashes.add("sha256-" + createHash("sha256").update(text, "utf8").digest("base64"));
  }
  return hashes;
}
let cspPages = 0;
let cspHashTotal = 0;
for (const file of files.filter((f) => f.endsWith(".html"))) {
  const route = "/" + relative(OUT, file).replace(/\\/g, "/");
  const html = readFileSync(file, "utf8");
  const metas = [...html.matchAll(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"\s*\/?>/g)];
  if (metas.length !== 1) {
    note(`${route}: 应有且仅有 1 个 CSP <meta>，实际 ${metas.length} 个（inject-csp-meta.mjs 未执行？）`);
    continue;
  }
  const [meta] = metas;
  const firstScript = html.indexOf("<script");
  if (firstScript >= 0 && meta.index > firstScript) note(`${route}: CSP <meta> 出现在脚本之后，对之前的脚本不生效`);
  const policy = meta[1];
  if (!policy.startsWith("script-src 'self'")) note(`${route}: CSP <meta> 不是 script-src 策略`);
  if (/unsafe-inline|unsafe-eval|unsafe-hashes|\*/.test(policy)) note(`${route}: CSP <meta> 含宽松来源`);
  const declared = new Set([...policy.matchAll(/'(sha256-[A-Za-z0-9+/=]+)'/g)].map((m) => m[1]));
  const actual = executableInlineHashes(html);
  const missing = [...actual].filter((h) => !declared.has(h));
  const stale = [...declared].filter((h) => !actual.has(h));
  if (missing.length) note(`${route}: ${missing.length} 个内联脚本不在 CSP <meta> 里（会被浏览器拦截）`);
  if (stale.length) note(`${route}: CSP <meta> 里有 ${stale.length} 个 hash 对不上任何内联脚本`);
  if (/<[a-z][^>]*\son[a-z]+\s*=\s*["']/i.test(html.replace(/<script\b[\s\S]*?<\/script>/g, ""))) {
    note(`${route}: 存在内联事件处理属性（被 script-src-attr 'none' 拦截）`);
  }
  cspPages++;
  cspHashTotal += declared.size;
}

// ── 11：Service Worker 离线页 ──
const offlinePath = join(OUT, "offline", "index.html");
if (!existsSync(offlinePath)) note("缺少 /offline/（sw.js 的离线兜底页）");
else if (/\/_next\/|\.woff2|<link[^>]+stylesheet/.test(readFileSync(offlinePath, "utf8"))) {
  note("/offline/ 必须自包含，不能引用 /_next/ 资源、字体或外链样式");
}

// ── 12：RSC 载荷必须是点分式同层文件 ──
// 目录式（__next.xxx/__PAGE__.txt）客户端从不请求，预取会全部 404。
const nextDirs = files.filter((f) => /[\\/]__next\.[^\\/]+[\\/]/.test(f));
if (nextDirs.length) note(`存在 ${nextDirs.length} 个目录式 RSC 载荷（客户端只请求点分式同层文件，这些会全部 404）`);
const dupPayload = files.filter((f) => f.endsWith("__next._full.txt")).length;
if (dupPayload > 5) note(`仍有 ${dupPayload} 个 __next._full.txt —— clean-duplicate-payload.mjs 未生效`);

// ── 汇总 ──
console.log("产物自检");
console.log("".padEnd(58, "-"));
console.log(`页面数              ${pages.length}`);
console.log(`canonical 指向首页  ${homeCanonical}   (历史基线: 22)`);
console.log(`缺少 canonical      ${missingCanonical}`);
console.log(`使用默认标题        ${genericTitle}   (历史基线: 15)`);
console.log(`站内断链            ${brokenLinks.size}`);
console.log(`页内锚点无目标      ${brokenAnchors.size}`);
console.log(`CSP 脚本 hash       ${cspPages} 页 / ${cspHashTotal} 个`);
if (sliceWarning) console.log(sliceWarning);
console.log(`分享图缺失          ${missingOg}`);
console.log("".padEnd(58, "-"));

if (problems.length) {
  console.error(`\n❌ 发现 ${problems.length} 个问题：`);
  for (const p of problems.slice(0, 40)) console.error("   " + p);
  if (problems.length > 40) console.error(`   … 另有 ${problems.length - 40} 条`);
  process.exit(1);
}
console.log("\n✅ 产物自检全部通过");
