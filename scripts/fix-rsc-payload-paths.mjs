/**
 * 修复 Next 16 静态导出在 Windows 下的 RSC 预取载荷路径不匹配（vercel/next.js#85374）。
 *
 * Next.js 16.4.6 的 export/index.js 调用 path.relative(...) 收集分段路径，然后交给
 * convertSegmentPathToStaticExportFilename（仅替换 `/` 为 `.`）：
 *   - Linux/macOS：path.relative 返回 `/` 分隔路径，已直接产出点分式文件；本脚本为 0 次操作。
 *   - Windows：path.relative 返回 `\` 分隔路径，导致依然写出目录式结构：
 *       out/chapters/__next.chapters/__PAGE__.txt
 *       out/chapters/01-xiaoyao-you/__next.chapters/$d$id/__PAGE__.txt
 *     而客户端运行时始终按 `/` 拼接请求点分式同层文件：
 *       /chapters/__next.chapters.__PAGE__.txt
 *       /chapters/01-xiaoyao-you/__next.chapters.$d$id.__PAGE__.txt
 *
 * 本脚本在构建后把所有 `__next.*` 目录内的文件展平为点分式同层文件（分隔符 → `.`）并删掉空目录。
 *
 * 运行：node scripts/fix-rsc-payload-paths.mjs（已接入 npm run build）
 * 支持 --dry-run 只打印将要做的事，不实际改动。
 */
import { existsSync, readdirSync, renameSync, rmSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const DRY_RUN = process.argv.includes("--dry-run");
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "out");

if (!existsSync(OUT)) {
  console.warn("[fix-rsc-payload] out/ 不存在，跳过（可能尚未构建）");
  process.exit(0);
}

/** 递归收集所有名字以 __next. 开头的目录 */
function collectNextDirs(dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const p = join(dir, e.name);
    if (e.name.startsWith("__next.")) acc.push(p);
    else collectNextDirs(p, acc);
  }
  return acc;
}

/** 递归收集目录下所有文件 */
function collectFiles(dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) collectFiles(p, acc);
    else acc.push(p);
  }
  return acc;
}

const dirs = collectNextDirs(OUT);
if (dirs.length === 0) {
  console.log("[fix-rsc-payload] 无目录式 RSC 载荷，跳过");
  process.exit(0);
}

let moved = 0;
let removedDirs = 0;

for (const d of dirs) {
  const base = basename(d); // 如 __next.chapters
  const files = collectFiles(d);

  for (const f of files) {
    // f 相对 d 的路径（系统分隔符），展平为点分式文件名
    const rel = relative(d, f).split(/[\\/]/).join(".");
    const target = join(dirname(d), `${base}.${rel}`);
    if (DRY_RUN) {
      console.log(`[dry-run] ${relative(OUT, f)} -> ${relative(OUT, target)}`);
    } else {
      renameSync(f, target);
    }
    moved++;
  }

  if (!DRY_RUN) {
    rmSync(d, { recursive: true, force: true });
    removedDirs++;
  }
}

console.log(
  `[fix-rsc-payload] ${DRY_RUN ? "[dry-run] " : ""}展平 ${moved} 个 RSC 载荷文件` +
    (DRY_RUN ? "" : `，清理 ${removedDirs} 个 __next.* 目录`)
);
