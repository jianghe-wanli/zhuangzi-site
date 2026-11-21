/**
 * 首屏体积预算检查。
 *
 * 为什么需要：本站是静态古籍阅读站，正文本身才是主体，但实测每个路由都要
 * 先下载约 200KB(gzip) 的 JS；章节页更是 HTML + JS 合计 348–464KB(gzip)，
 * 其中齐物论页 HTML 达 1MB（未压缩），约 43% 是给客户端组件做 hydration 的
 * RSC 重复载荷。没有预算约束时，这类回退不会被任何人发现。
 *
 * 本脚本对**真实产物**做测量（读 out/ 下每个 index.html 引用的 chunk），
 * 用 gzip 后大小对照预算，超出即以非零码退出，可直接接进 CI。
 *
 * 运行：node scripts/check-budget.mjs
 *      node scripts/check-budget.mjs --update   （把当前值写回基线）
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "out");
const BASELINE_PATH = join(ROOT, "scripts", "budget.json");

if (!existsSync(OUT)) {
  console.error("未找到 out/ —— 请先执行 npm run build");
  process.exit(1);
}

/**
 * 绝对上限（KB, gzip）。只是兜底；真正防回退的是下面的「相对基线」门禁。
 *
 * 口径说明：JS 只计现代浏览器**实际会下载**的脚本。Next 在每页都输出一个
 * `<script noModule>` 的 polyfill（gzip 约 38KB），支持 ES modules 的浏览器
 * 不会请求它；此前它被算进每个路由的 JS，共享基线因此虚高约 38KB。
 */
const BUDGETS = {
  // 每个路由共享的 JS 基线
  sharedJsGzipKB: 190,
  // 单个路由 HTML(gzip)
  routeHtmlGzipKB: 260,
  // 单路由总量（HTML + JS + CSS，gzip）
  routeTotalGzipKB: 440,
  // 全站 out/ 总量
  totalOutputMB: 45,
};

/**
 * 相对基线门禁：任一指标比 scripts/budget.json 记录的基线高出超过此比例即失败。
 * 此前基线文件只写不读，绝对预算又比实测高出 15–50%，等于几十 KB 的回退都能悄悄溜过。
 * 有意增长时运行 `node scripts/check-budget.mjs --update` 更新基线并在提交里说明。
 */
const REGRESSION_TOLERANCE = 0.05;

const gz = (buf) => gzipSync(buf, { level: 9 }).length;

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const allFiles = walk(OUT);
const totalBytes = allFiles.reduce((s, f) => s + statSync(f).size, 0);

const htmlFiles = allFiles.filter((f) => f.endsWith("index.html"));
const assetCache = new Map();
const assetGzip = (rel) => {
  if (assetCache.has(rel)) return assetCache.get(rel);
  const abs = join(OUT, rel.replace(/^\//, ""));
  const size = existsSync(abs) ? gz(readFileSync(abs)) : 0;
  assetCache.set(rel, size);
  return size;
};

const routes = [];
let legacyJsBytes = 0;
for (const file of htmlFiles) {
  const html = readFileSync(file, "utf8");
  // 现代浏览器不会下载 <script noModule>，不计入首屏
  const legacy = new Set(
    [...html.matchAll(/<script\b[^>]*\bnomodule\b[^>]*>/gi)]
      .map((m) => /src="([^"]+)"/.exec(m[0])?.[1])
      .filter(Boolean)
  );
  const refs = [...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)].map((m) => m[1]);
  // 不加载任何构建产物的独立页（SW 离线兜底页 /offline/）不参与路由统计，
  // 否则「共享 JS 基线 = 各路由 JS 的最小值」会被它拉成 0。
  if (refs.length === 0) continue;
  const unique = [...new Set(refs)].filter((r) => !legacy.has(r));
  for (const r of legacy) legacyJsBytes = Math.max(legacyJsBytes, assetGzip(r));
  let js = 0;
  let css = 0;
  for (const r of unique) {
    const size = assetGzip(r);
    if (r.endsWith(".css")) css += size;
    else js += size;
  }
  const htmlGzip = gz(readFileSync(file));
  const route = "/" + relative(OUT, dirname(file)).replace(/\\/g, "/");
  routes.push({
    route: route === "/." ? "/" : route,
    htmlKB: htmlGzip / 1024,
    jsKB: js / 1024,
    cssKB: css / 1024,
    totalKB: (htmlGzip + js + css) / 1024,
  });
}

routes.sort((a, b) => b.totalKB - a.totalKB);
const sharedJsKB = Math.min(...routes.map((r) => r.jsKB));

const failures = [];
if (sharedJsKB > BUDGETS.sharedJsGzipKB) {
  failures.push(
    `共享 JS 基线 ${sharedJsKB.toFixed(1)}KB > 预算 ${BUDGETS.sharedJsGzipKB}KB`
  );
}
for (const r of routes) {
  if (r.htmlKB > BUDGETS.routeHtmlGzipKB) {
    failures.push(`${r.route} HTML ${r.htmlKB.toFixed(1)}KB > ${BUDGETS.routeHtmlGzipKB}KB`);
  }
  if (r.totalKB > BUDGETS.routeTotalGzipKB) {
    failures.push(`${r.route} 首屏合计 ${r.totalKB.toFixed(1)}KB > ${BUDGETS.routeTotalGzipKB}KB`);
  }
}
const totalMB = totalBytes / 1024 / 1024;
if (totalMB > BUDGETS.totalOutputMB) {
  failures.push(`out/ 总体积 ${totalMB.toFixed(1)}MB > ${BUDGETS.totalOutputMB}MB`);
}

const UPDATE = process.argv.includes("--update");
const baseline = existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, "utf8")) : null;
if (baseline && !UPDATE) {
  const checks = [
    ["共享 JS 基线", sharedJsKB, baseline.sharedJsGzipKB, "KB"],
    ["最重路由首屏合计", routes[0]?.totalKB ?? 0, baseline.worstRouteTotalGzipKB, "KB"],
    ["out/ 总体积", totalMB, baseline.totalOutputMB, "MB"],
  ];
  for (const [label, now, base, unit] of checks) {
    if (typeof base === "number" && now > base * (1 + REGRESSION_TOLERANCE)) {
      failures.push(
        `${label} ${now.toFixed(1)}${unit} 比基线 ${base}${unit} 高出 ` +
          `${(((now - base) / base) * 100).toFixed(1)}%（容忍 ${REGRESSION_TOLERANCE * 100}%）`
      );
    }
  }
}

console.log("首屏体积（gzip, KB） —— 最重的 12 个路由");
console.log("".padEnd(74, "-"));
console.log(
  "route".padEnd(34) + "html".padStart(9) + "js".padStart(9) + "css".padStart(8) + "total".padStart(10)
);
for (const r of routes.slice(0, 12)) {
  console.log(
    r.route.padEnd(34) +
      r.htmlKB.toFixed(1).padStart(9) +
      r.jsKB.toFixed(1).padStart(9) +
      r.cssKB.toFixed(1).padStart(8) +
      r.totalKB.toFixed(1).padStart(10)
  );
}
console.log("".padEnd(74, "-"));
console.log(`路由数 ${routes.length}   共享 JS 基线 ${sharedJsKB.toFixed(1)}KB   out/ 总体积 ${totalMB.toFixed(1)}MB`);
console.log(`（另有 noModule polyfill ${(legacyJsBytes / 1024).toFixed(1)}KB，仅旧浏览器下载，不计入上表）`);

if (UPDATE) {
  const baseline = {
    updatedAt: new Date().toISOString().slice(0, 10),
    sharedJsGzipKB: Number(sharedJsKB.toFixed(1)),
    worstRoute: routes[0]?.route,
    worstRouteTotalGzipKB: Number(routes[0]?.totalKB.toFixed(1)),
    totalOutputMB: Number(totalMB.toFixed(1)),
  };
  writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + "\n", "utf8");
  console.log(`\n已写入基线 ${relative(ROOT, BASELINE_PATH)}`);
}

if (failures.length) {
  console.error("\n❌ 超出体积预算：");
  for (const f of failures) console.error("   " + f);
  console.error(
    "\n若为有意的体积增长：运行 node scripts/check-budget.mjs --update 更新基线" +
      "（超出绝对上限时另需调整 BUDGETS），并在提交信息里说明原因。"
  );
  process.exit(1);
}
console.log("\n✅ 全部路由均在体积预算内");
