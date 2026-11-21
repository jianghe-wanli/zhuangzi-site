// 构建后自动更新 Service Worker 缓存版本号
// 用 .next/BUILD_ID（每次构建唯一）替换 sw.js 里硬编码的 v1，
// 避免部署新版本后旧 SW 缓存不失效、用户看到旧内容。
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const cwd = process.cwd();
const buildId = readFileSync(join(cwd, ".next", "BUILD_ID"), "utf8").trim();
const swPath = join(cwd, "out", "sw.js");
const sw = readFileSync(swPath, "utf8");

// 匹配所有带 -v<数字> 后缀的缓存名；zhuangzi-immutable（内容哈希资源）故意不带后缀，
// 跨部署保留。
const VERSIONED = /(zhuangzi-[a-z]+)-v\d+/g;
const bumped = sw.replace(VERSIONED, `$1-${buildId}`);

if (bumped === sw) {
  // 没替换到说明 sw.js 的命名约定变了：旧缓存将永不失效，必须让构建失败
  console.error("[sw] 未找到可替换的缓存版本号（约定：zhuangzi-<名称>-v1）");
  process.exit(1);
}
writeFileSync(swPath, bumped);
console.log(`[sw] 缓存版本号已更新为 ${buildId}`);
