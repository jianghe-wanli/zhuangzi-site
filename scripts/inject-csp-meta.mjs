// 构建后处理：让 CSP 的 script-src 不再依赖 'unsafe-inline'。
//
// 静态站点没有服务端可发 nonce，_headers 也无法按页穷举 hash（每页的 RSC 内联
// 载荷都不同）。做法是为 out/ 里每个 HTML：
//   1. 把 Next 流式输出的相邻 `self.__next_f.push(...)` 内联脚本合并成一个
//      （它们不在 React 树里、顺序执行，合并后语义不变；每页从 30~57 个降到个位数，
//      否则光 hash 清单就要 2~3 KB）；
//   2. 计算全部「可执行内联脚本」的 sha256；
//   3. 在 <head> 最前面注入 <meta http-equiv="Content-Security-Policy"
//      content="script-src 'self' 'sha256-…' …">。
// 浏览器对多条策略取交集：_headers 里的 script-src 仍带 'unsafe-inline'（否则 hash
// 脚本也过不了那一条），但 meta 这条只认 hash，最终效果是「只有构建时就在页面里的
// 内联脚本能执行」。application/ld+json 等数据块不受 script-src 约束，不计入。
//
// hash 一律构建后现算，改了主题脚本 / 新增内联脚本都不需要动这里。
// scripts/check-output.mjs 会独立复算并断言「meta 里的 hash 与页面内联脚本一一对应」。
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";

const OUT = join(process.cwd(), "out");
export const CSP_META_MARK = 'http-equiv="Content-Security-Policy"';
const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
const JS_TYPES = new Set(["", "text/javascript", "application/javascript", "module"]);

/** 属性串是否表示「会被执行的内联脚本」（无 src，type 缺省或为 JS） */
export function isExecutableInline(attrs) {
  if (/\ssrc\s*=/.test(attrs)) return false;
  const type = /\stype\s*=\s*["']?([^"'\s>]*)/.exec(attrs)?.[1] ?? "";
  return JS_TYPES.has(type.toLowerCase());
}

/** 浏览器对脚本文本求 hash 前，HTML 解析器已把 CRLF 规范成 LF */
export function hashOf(body) {
  return "sha256-" + createHash("sha256").update(body.replace(/\r\n?/g, "\n"), "utf8").digest("base64");
}

/** 页面内全部可执行内联脚本的 hash（去重，按出现顺序） */
export function inlineScriptHashes(html) {
  const hashes = [];
  for (const [, attrs, body] of html.matchAll(SCRIPT_RE)) {
    if (!isExecutableInline(attrs) || body === "") continue;
    const h = hashOf(body);
    if (!hashes.includes(h)) hashes.push(h);
  }
  return hashes;
}

/** 合并 </head> 之后相邻的、无属性的 __next_f 载荷脚本 */
function mergeFlightScripts(html) {
  const headEnd = html.indexOf("</head>");
  if (headEnd < 0) return html;
  const RUN = /(?:<script>self\.__next_f\.push\((?:(?!<\/script>)[\s\S])*\)<\/script>){2,}/g;
  const body = html.slice(headEnd).replace(RUN, (run) => {
    const parts = run.slice("<script>".length, -"</script>".length).split("</script><script>");
    return `<script>${parts.join(";")}</script>`;
  });
  return html.slice(0, headEnd) + body;
}

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (name.endsWith(".html")) acc.push(p);
  }
  return acc;
}

function main() {
  const rows = [];
  for (const file of walk(OUT)) {
    const original = readFileSync(file, "utf8");
    if (original.includes(CSP_META_MARK)) {
      console.error(`[csp] ${relative(OUT, file)} 已含 CSP meta（脚本被重复执行？）`);
      process.exit(1);
    }
    const before = [...original.matchAll(SCRIPT_RE)].filter(([, a, b]) => isExecutableInline(a) && b).length;
    const merged = mergeFlightScripts(original);
    const hashes = inlineScriptHashes(merged);
    const policy = ["script-src 'self'", ...hashes.map((h) => `'${h}'`)].join(" ");
    const meta = `<meta ${CSP_META_MARK} content="${policy}"/>`;
    // 必须先于页面里任何脚本；紧跟 charset 声明（它得留在前 1024 字节内）
    const anchor = /<head[^>]*>(?:\s*<meta charset="utf-8"\s*\/?>)?/i.exec(merged);
    if (!anchor) {
      console.error(`[csp] ${relative(OUT, file)} 没有 <head>，无法注入`);
      process.exit(1);
    }
    const at = anchor.index + anchor[0].length;
    if (merged.slice(0, at).includes("<script")) {
      console.error(`[csp] ${relative(OUT, file)} 的 <head> 之前就有脚本`);
      process.exit(1);
    }
    const result = merged.slice(0, at) + meta + merged.slice(at);
    writeFileSync(file, result);
    rows.push({
      file: relative(OUT, file),
      before,
      after: hashes.length,
      raw: Buffer.byteLength(result) - Buffer.byteLength(original),
      gz: gzipSync(result).length - gzipSync(original).length,
    });
  }
  const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
  const avg = (k) => Math.round(sum(k) / rows.length);
  const max = (k) => rows.reduce((a, r) => (r[k] > a[k] ? r : a));
  console.log(
    `[csp] ${rows.length} 个页面已注入 script-src hash；内联脚本 ${sum("before")} → ${sum("after")} 个；` +
      `每页字节变化 平均 ${avg("raw")} B（gzip ${avg("gz")} B），` +
      `最大 ${max("raw").raw} B @ ${max("raw").file}（gzip 最大 ${max("gz").gz} B @ ${max("gz").file}）`,
  );
  if (process.argv.includes("--verbose")) console.table(rows);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) main();
