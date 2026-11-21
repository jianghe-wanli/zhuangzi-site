// ──────────────────────────────────────────
// Service Worker — 莊子數位典藏
//
// 策略：
//   /_next/static/*          → Cache-First，放进**不带版本号**的缓存（文件名即内容哈希，
//                              跨部署仍然有效，不随发版清空）
//   字体 / 图片               → Cache-First（文件名不带哈希，随版本号失效）
//   *.json                   → Stale-While-Revalidate
//   RSC 载荷（*.txt）         → Network-First，离线回退缓存（客户端导航离线可用）
//   HTML 导航                → Network-First（慢网超时回退缓存）+ 离线页
//
// 版本号 -v1 由 scripts/bump-sw-version.mjs 在 build 后替换为 BUILD_ID，
// 使每次部署自动失效旧缓存。CACHE_IMMUTABLE 故意不带 -v 后缀，不参与替换与清理。
//
// 行为由 tests/sw.test.ts 覆盖（在 vm 里加载本文件）。
// ──────────────────────────────────────────

const CACHE_IMMUTABLE = "zhuangzi-immutable";
const CACHE_STATIC = "zhuangzi-static-v1";
const CACHE_PAGES = "zhuangzi-pages-v1";
const CACHE_RSC = "zhuangzi-rsc-v1";
const CACHE_JSON = "zhuangzi-json-v1";
const CACHE_SHELL = "zhuangzi-shell-v1";

const CURRENT_CACHES = [
  CACHE_IMMUTABLE,
  CACHE_STATIC,
  CACHE_PAGES,
  CACHE_RSC,
  CACHE_JSON,
  CACHE_SHELL,
];

// 缓存条目上限。章节页 HTML 单页可达 1MB（齐物论 ~1MB），33 篇全缓存
// 叠加 1.5MB 级的 JSON 数据，很容易触发浏览器存储配额而导致整个
// Cache Storage 被清空。CACHE_SHELL（离线页）不设上限、永不裁剪：
// 此前离线兜底与页面同放一个缓存，按插入顺序裁剪时它恰好最旧，
// 访问满 40 页后离线兜底反而第一个被淘汰。
const MAX_ENTRIES = {
  [CACHE_IMMUTABLE]: 200,
  [CACHE_STATIC]: 120,
  [CACHE_PAGES]: 40,
  [CACHE_RSC]: 200,
  [CACHE_JSON]: 30,
};

// 独立离线页（public/offline/index.html）：自包含、不依赖任何 JS chunk，
// 会列出本机已缓存、可离线阅读的页面。此前回退到 404 页，离线时用户看到的是
// 「页面不存在」，且预缓存的 /404.html 在 Cloudflare Pages 上是 308 → /404，
// 带 redirected 标志的响应不能用于导航。
const OFFLINE_URL = "/offline/";
const PRECACHE_URLS = [OFFLINE_URL];

// 慢网（lie-fi）下导航若超过此时长仍无响应、且本机有该页缓存，先用缓存。
const NAV_TIMEOUT_MS = 4000;

// ── 工具 ──

/** 只缓存**自己域名**下、状态正常、非 partial、未经重定向的 GET 响应。 */
function isCacheable(request, response) {
  if (!response) return false;
  // opaque 响应（cors: no-cors 的跨域资源）status 恒为 0，内容无法校验
  if (response.type === "opaque" || response.type === "opaqueredirect") return false;
  if (!response.ok) return false; // 4xx/5xx 不入缓存
  if (response.status === 206) return false; // Range 请求片段
  if (response.redirected) return false; // 重定向后的响应不能回放给导航请求
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false; // 高德瓦片不缓存
  return true;
}

/** 缓存键：去掉 query / hash（?_rsc=…、?q=… 不应各占一条）。 */
function cacheKey(request) {
  const url = new URL(request.url);
  return url.origin + url.pathname;
}

const trimming = new Set();

/** 按插入顺序裁剪缓存条目数，防止无界增长撑爆配额。同一缓存同时只跑一轮。 */
async function trimCache(cacheName) {
  const maxEntries = MAX_ENTRIES[cacheName];
  if (!maxEntries || trimming.has(cacheName)) return;
  trimming.add(cacheName);
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    // Cache Storage 的 keys() 按插入顺序返回，删最旧的
    const excess = keys.length - maxEntries;
    for (let i = 0; i < excess; i++) await cache.delete(keys[i]);
  } finally {
    trimming.delete(cacheName);
  }
}

async function putSafely(cacheName, key, request, response) {
  if (!isCacheable(request, response)) return;
  try {
    const cache = await caches.open(cacheName);
    await cache.put(key, response);
    await trimCache(cacheName);
  } catch {
    // 配额不足等写入失败不应影响页面
  }
}

async function matchIn(cacheName, key) {
  const cache = await caches.open(cacheName);
  return cache.match(key);
}

async function offlineFallback() {
  const hit = await matchIn(CACHE_SHELL, OFFLINE_URL);
  const headers = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" };
  if (hit) return new Response(hit.body, { status: 503, statusText: "Offline", headers });
  return new Response(
    "<!doctype html><html lang=zh-CN><meta charset=utf-8>" +
      "<meta name=viewport content=\"width=device-width,initial-scale=1\"><title>离线</title>" +
      "<body style=\"font-family:serif;padding:2rem;text-align:center\">" +
      "<h1>離線</h1><p>当前页面尚未缓存，请连网后重试。</p>",
    { status: 503, statusText: "Offline", headers }
  );
}

function isRscRequest(request, url) {
  if (request.headers.get("RSC") === "1") return true;
  return (
    url.pathname.endsWith(".txt") &&
    (url.pathname.includes("/__next.") || url.pathname.endsWith("/index.txt"))
  );
}

// ── 各策略 ──

/**
 * Cache-First。写缓存放进 waitUntil，**不阻塞响应**：
 * 此前 `await cache.put()` 之后才 return，要等整个 body 下载并落盘才把响应交给页面。
 */
async function cacheFirst(event, cacheName) {
  const { request } = event;
  const key = cacheKey(request);
  const cached = await matchIn(cacheName, key);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    event.waitUntil(putSafely(cacheName, key, request, response.clone()));
    return response;
  } catch {
    // 静态资源取不到就如实失败，交由页面自身处理
    return Response.error();
  }
}

async function staleWhileRevalidate(event, cacheName) {
  const { request } = event;
  const key = cacheKey(request);
  const cached = await matchIn(cacheName, key);
  const network = fetch(request)
    .then((response) => {
      event.waitUntil(putSafely(cacheName, key, request, response.clone()));
      return response;
    })
    .catch(() => cached || Response.error());
  // 已有缓存时立即返回；后台刷新靠 waitUntil 保活，否则 SW 可能在写入前被回收
  if (cached) {
    event.waitUntil(network.then(() => undefined));
    return cached;
  }
  return network;
}

async function networkFirstRsc(event) {
  const { request } = event;
  const key = cacheKey(request);
  try {
    const response = await fetch(request);
    event.waitUntil(putSafely(CACHE_RSC, key, request, response.clone()));
    return response;
  } catch {
    // 取不到也没缓存 → 如实失败，Next 路由器会退回整页导航，再走下面的页面策略
    return (await matchIn(CACHE_RSC, key)) || Response.error();
  }
}

async function networkFirstPage(event) {
  const { request } = event;
  const key = cacheKey(request);

  const network = (async () => {
    // 若启用了 navigationPreload，优先用预载响应
    const preload = await event.preloadResponse;
    const response = preload || (await fetch(request));
    event.waitUntil(putSafely(CACHE_PAGES, key, request, response.clone()));
    return response;
  })();

  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), NAV_TIMEOUT_MS);
  });

  try {
    const first = await Promise.race([network, timeout]);
    if (first) return first;
    // 超时：有缓存先给缓存（网络请求继续，回来后更新缓存）；没有就继续等网络
    const cached = await matchIn(CACHE_PAGES, key);
    if (cached) {
      event.waitUntil(network.then(() => undefined, () => undefined));
      return cached;
    }
    return await network;
  } catch {
    return (await matchIn(CACHE_PAGES, key)) || (await offlineFallback());
  } finally {
    clearTimeout(timer);
  }
}

// ── Install：预缓存离线兜底 ──
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_SHELL);
      // 逐个取，避免 addAll 里任意一个失败就整体 reject；重定向过的响应不入缓存
      await Promise.allSettled(
        PRECACHE_URLS.map(async (url) => {
          const response = await fetch(url, { cache: "reload" });
          if (response.ok && !response.redirected) await cache.put(url, response);
        })
      );
      await self.skipWaiting();
    })()
  );
});

// ── Activate：清理旧版本缓存 + 开启导航预载 ──
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // 导航预载：让 SW 启动与网络请求并行，减少导航延迟
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable().catch(() => {});
      }
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("zhuangzi-") && !CURRENT_CACHES.includes(k))
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// ── Fetch ──
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // 跨域请求（高德地图瓦片）交给浏览器默认处理，不进我们的缓存。
  // Leaflet 标记图标已自托管（/vendor/leaflet/，见 TODO 3.9）。
  if (url.origin !== self.location.origin) return;

  // AI 代理绝不缓存；sw.js 自身交给浏览器的更新检查
  if (url.pathname.startsWith("/api/") || url.pathname === "/sw.js") return;

  // Range 请求不走缓存（缓存里只有完整响应）
  if (request.headers.has("range")) return;

  // 1) 内容哈希命名的构建产物 → Cache-First，跨版本保留
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(event, CACHE_IMMUTABLE));
    return;
  }

  // 2) 字体与图片 → Cache-First，随版本失效
  if (/\.(png|svg|ico|webp|avif|woff2?)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(event, CACHE_STATIC));
    return;
  }

  // 3) JSON 数据 → Stale-While-Revalidate
  if (url.pathname.endsWith(".json")) {
    event.respondWith(staleWhileRevalidate(event, CACHE_JSON));
    return;
  }

  // 4) RSC 载荷（客户端导航 / 预取）→ Network-First
  if (isRscRequest(request, url)) {
    event.respondWith(networkFirstRsc(event));
    return;
  }

  // 5) 页面导航 → Network-First，失败回退缓存 / 离线页
  if (request.mode === "navigate" || /\.html?$/.test(url.pathname) || url.pathname.endsWith("/")) {
    event.respondWith(networkFirstPage(event));
  }
});

// 允许页面主动要求新 SW 立即接管（配合前端「有新版本」提示）
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
