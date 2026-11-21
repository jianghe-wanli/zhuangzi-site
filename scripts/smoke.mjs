// 构建产物的无头浏览器冒烟：用真实 Chrome 打开 out/，断言
//   - 首页 / 篇章 / 概念 / 搜索 / 404 / 离线页都能渲染出预期内容
//   - 全程无控制台报错、无未捕获异常、无 CSP 违规、无失败的同源请求
//   - 客户端路由可用（点击站内链接不整页刷新）
//   - Service Worker 注册成功；断网后访问过的页面仍可打开，未访问的落到离线页
//
// 零依赖：Node 22 自带 WebSocket，直接说 Chrome DevTools Protocol。
// 自带的静态服务器会套用 out/_headers 里 `/*` 的响应头（含 CSP），
// 这样 header 策略与每页 <meta> 策略的叠加效果和线上一致。
//
// 用法：node scripts/smoke.mjs        （需先 npm run build）
//       CHROME_PATH=/path/to/chrome node scripts/smoke.mjs
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const OUT = join(process.cwd(), "out");
const CHAPTER = "/chapters/01-xiaoyao-you/";
const CONCEPT = "/concepts/dao/";
const STEP_TIMEOUT_MS = 20_000;

if (!existsSync(join(OUT, "index.html"))) {
  console.error("out/ 不存在，请先 npm run build");
  process.exit(1);
}

// ── 静态服务器 ──────────────────────────────────────────
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
};

/** 取 _headers 中 `/*` 规则块的响应头（冒烟只关心全站安全头） */
function globalHeaders() {
  const path = join(OUT, "_headers");
  if (!existsSync(path)) return {};
  const headers = {};
  let inGlobal = false;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      inGlobal = line.trim() === "/*";
      continue;
    }
    if (!inGlobal) continue;
    const i = line.indexOf(":");
    if (i < 0) continue;
    const name = line.slice(0, i).trim();
    // HSTS / 强制升级 https 在 http://127.0.0.1 上没有意义，且会干扰本地请求
    if (/^strict-transport-security$/i.test(name)) continue;
    headers[name] = line
      .slice(i + 1)
      .trim()
      .replace(/;\s*upgrade-insecure-requests/i, "");
  }
  return headers;
}

function startServer() {
  const extra = globalHeaders();
  const server = createServer((req, res) => {
    let pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let file = normalize(join(OUT, pathname));
    if (!file.startsWith(OUT)) {
      res.writeHead(403).end();
      return;
    }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    let status = 200;
    if (!existsSync(file)) {
      file = join(OUT, "404.html");
      status = 404;
    }
    res.writeHead(status, {
      ...extra,
      "Content-Type": MIME[extname(file)] ?? "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

// ── Chrome + CDP ────────────────────────────────────────
function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    join(process.env.HOME ?? "", ".local/bin/google-chrome"),
  ];
  const found = candidates.find((p) => p && existsSync(p));
  if (!found) throw new Error("找不到 Chrome，请设置 CHROME_PATH");
  return found;
}

async function launchChrome() {
  const profile = mkdtempSync(join(tmpdir(), "zz-smoke-"));
  const proc = spawn(
    findChrome(),
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--window-size=1280,900",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  const portFile = join(profile, "DevToolsActivePort");
  for (let i = 0; i < 100 && !existsSync(portFile); i++) await sleep(100);
  if (!existsSync(portFile)) throw new Error("Chrome 未能启动");
  const [port, path] = readFileSync(portFile, "utf8").trim().split("\n");
  const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error("无法连接 Chrome DevTools"));
  });
  let nextId = 0;
  const pending = new Map();
  const listeners = new Set();
  ws.onmessage = ({ data }) => {
    const msg = JSON.parse(data);
    if (msg.id !== undefined) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p?.reject(new Error(`${p.method}: ${msg.error.message}`));
      else p?.resolve(msg.result);
    } else {
      for (const fn of listeners) fn(msg);
    }
  };
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject, method });
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  const close = () => {
    try {
      ws.close();
    } catch {
      // 已断开
    }
    proc.kill();
    // Chrome 退出后才能删 profile；删不掉不影响结果
    setTimeout(() => rmSync(profile, { recursive: true, force: true }), 500).unref();
  };
  return { send, listeners, close };
}

// ── 断言工具 ────────────────────────────────────────────
const problems = [];
let current = "";
const fail = (message) => problems.push(`[${current}] ${message}`);

async function main() {
  let server = await startServer();
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  const chrome = await launchChrome();
  const { targetId } = await chrome.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await chrome.send("Target.attachToTarget", { targetId, flatten: true });
  const cdp = (method, params) => chrome.send(method, params, sessionId);

  let offline = false;
  chrome.listeners.add((msg) => {
    if (msg.sessionId !== sessionId) return;
    const p = msg.params;
    if (msg.method === "Runtime.exceptionThrown") {
      fail(`未捕获异常: ${p.exceptionDetails.exception?.description ?? p.exceptionDetails.text}`);
    } else if (msg.method === "Runtime.consoleAPICalled" && p.type === "error") {
      fail(`console.error: ${p.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 300)}`);
    } else if (msg.method === "Log.entryAdded" && p.entry.level === "error") {
      // 断网阶段的网络失败是预期行为；CSP 违规（source=security）任何时候都算失败
      if (offline && p.entry.source === "network") return;
      fail(`浏览器报错(${p.entry.source}): ${p.entry.text.slice(0, 300)} ${p.entry.url ?? ""}`);
    } else if (msg.method === "Runtime.bindingCalled" && p.name === "__smokeCsp") {
      fail(`CSP 违规: ${p.payload}`);
    }
  });
  await cdp("Runtime.enable");
  await cdp("Log.enable");
  await cdp("Page.enable");
  await cdp("Runtime.addBinding", { name: "__smokeCsp" });
  await cdp("Page.addScriptToEvaluateOnNewDocument", {
    source: `document.addEventListener("securitypolicyviolation", (e) =>
      window.__smokeCsp(e.violatedDirective + " ← " + (e.blockedURI || "inline") + " " + (e.sample || "")));`,
  });

  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await cdp("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value;
  };
  const waitFor = async (expression, what) => {
    const deadline = Date.now() + STEP_TIMEOUT_MS;
    while (Date.now() < deadline) {
      try {
        if (await evaluate(expression)) return true;
      } catch {
        // 导航途中执行上下文被销毁，重试即可
      }
      await sleep(100);
    }
    fail(`超时未满足：${what}`);
    return false;
  };
  const goto = async (path, name = path) => {
    current = name;
    await cdp("Page.navigate", { url: base + path });
    await waitFor(`document.readyState === "complete" && location.pathname === ${JSON.stringify(path.split("?")[0])}`, "页面加载完成");
  };
  const h1 = () => evaluate(`document.querySelector("h1")?.textContent?.trim() ?? ""`);
  // React 给已水合的 DOM 节点挂 __reactFiber$… 属性：以此判断客户端代码真的跑起来了
  const hydrated = () =>
    waitFor(
      `[...document.querySelectorAll("a[href^='/']")].some((el) => Object.keys(el).some((k) => k.startsWith("__reactFiber")))`,
      "React 完成水合",
    );
  const expectH1 = async (re) => {
    const text = await h1();
    if (!re.test(text)) fail(`<h1> 为「${text}」，期望匹配 ${re}`);
  };
  const step = (name) => {
    current = name;
    console.log(`  · ${name}`);
  };

  try {
    // 1. 首页：主题防闪烁脚本必须执行（它是 CSP hash 放行的内联脚本）
    step("首页");
    await goto("/", "首页");
    await expectH1(/莊子|庄子/);
    await hydrated();
    const themed = await evaluate(
      `document.documentElement.hasAttribute("data-theme") || document.documentElement.style.length > 0 || /theme|dark/.test(document.documentElement.className)`,
    );
    if (!themed) fail("主题内联脚本似乎没有执行（<html> 上没有任何主题标记）");
    const metaCsp = await evaluate(
      `document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content ?? ""`,
    );
    if (!/script-src 'self'( 'sha256-[A-Za-z0-9+/=]+')+$/.test(metaCsp)) fail(`CSP meta 缺失或格式不对: ${metaCsp.slice(0, 120)}`);

    // 2. CSP 确实在生效：运行时插入的内联脚本必须被拦下（否则上面的「无违规」没有意义）
    step("CSP 拦截运行时内联脚本");
    const before = problems.length;
    const executed = await evaluate(`(() => {
      const s = document.createElement("script");
      s.textContent = "window.__smokeInjected = true";
      document.head.appendChild(s);
      return window.__smokeInjected === true;
    })()`);
    await sleep(200);
    const blocked = problems.splice(before).some((p) => /CSP|Content Security Policy/.test(p));
    if (executed || !blocked) fail("运行时注入的内联脚本没有被 CSP 拦截");

    // 3. 客户端路由：点站内链接后，window 上的标记还在 = 没有整页刷新
    step("客户端路由 首页 → 篇章目录 → 篇章");
    await goto("/", "客户端路由");
    await hydrated();
    await evaluate(`window.__smokeMarker = 1`);
    await evaluate(`document.querySelector("a[href='/chapters/']").click()`);
    await waitFor(`location.pathname === "/chapters/" && /篇章/.test(document.querySelector("h1")?.textContent ?? "")`, "路由到 /chapters/");
    await evaluate(`document.querySelector("a[href='${CHAPTER}']").click()`);
    await waitFor(`location.pathname === "${CHAPTER}" && /逍遥游/.test(document.querySelector("h1")?.textContent ?? "")`, "路由到篇章页");
    if ((await evaluate(`window.__smokeMarker`)) !== 1) fail("点击站内链接触发了整页刷新，客户端路由不可用");
    await sleep(500);

    // 4. 篇章 / 概念 直接打开
    step("篇章页");
    await goto(CHAPTER, "篇章页");
    await expectH1(/逍遥游/);
    await hydrated();
    if (!(await evaluate(`document.body.innerText.includes("北冥有鱼")`))) fail("篇章正文缺失");

    // 4b. 页内锚点：平滑滚动途中下方懒渲染段落会撑高页面，终点必须仍落在目标上
    step("篇章页「阅览篇末总结」跳转到位");
    current = "页内锚点";
    await evaluate(`document.querySelector('a[href="#chapter-conclusion"]').click()`);
    const settled = () =>
      evaluate(`(() => {
        const top = document.getElementById("chapter-conclusion").getBoundingClientRect().top;
        return { top: Math.round(top), y: Math.round(scrollY), jumping: document.documentElement.hasAttribute("data-anchor-jump") };
      })()`);
    let pos = await settled();
    for (let last = NaN, stable = 0; stable < 5 || pos.jumping; ) {
      await sleep(100);
      pos = await settled();
      stable = pos.y === last ? stable + 1 : 0;
      last = pos.y;
      if (stable > 60) break;
    }
    if (pos.y === 0) fail("点击「阅览篇末总结」后页面没有滚动");
    if (pos.top < 0 || pos.top > 200) fail(`「阅览篇末总结」停在距目标 ${pos.top}px 处，期望目标位于视口顶部附近`);
    if (pos.jumping) fail("滚动结束后 html[data-anchor-jump] 没有清除");

    step("概念页");
    await goto(CONCEPT, "概念页");
    await expectH1(/^道/);
    await hydrated();

    // 5. 搜索：带查询参数打开，应出现指向篇章的结果链接
    step("搜索");
    await goto("/search/?q=" + encodeURIComponent("逍遥"), "搜索");
    await hydrated();
    await waitFor(`document.querySelectorAll("main a[href^='/chapters/']").length > 0`, "搜索「逍遥」出现结果");

    // 6. 404
    step("404 页");
    {
      current = "404 页";
      const before404 = problems.length;
      await cdp("Page.navigate", { url: base + "/no-such-page/" });
      await waitFor(`document.readyState === "complete" && /此页无何有/.test(document.querySelector("h1")?.textContent ?? "")`, "404 页渲染");
      await sleep(300);
      // 文档本身的 404 状态码会被 Chrome 记成一条 network 错误，属预期
      for (let i = problems.length - 1; i >= before404; i--) {
        if (/浏览器报错\(network\).*404.*no-such-page/.test(problems[i])) problems.splice(i, 1);
      }
    }

    // 7. 离线页（直接打开）
    step("离线页");
    await goto("/offline/", "离线页");
    if (!(await evaluate(`document.body.innerText.trim().length > 0`))) fail("离线页是空的");

    // 8. Service Worker：注册 → 缓存一页 → 断网回放
    step("Service Worker 注册与离线回放");
    await goto("/", "Service Worker");
    await evaluate(`navigator.serviceWorker.register("/sw.js").then(() => navigator.serviceWorker.ready).then(() => true)`);
    await waitFor(`navigator.serviceWorker.controller !== null || navigator.serviceWorker.ready.then((r) => r.active?.state === "activated")`, "SW 激活");
    await goto(CONCEPT, "Service Worker"); // 这次导航经过 SW，写入页面缓存
    await waitFor(`navigator.serviceWorker.controller !== null`, "页面受 SW 控制");
    await waitFor(`caches.keys().then(async (ks) => { for (const k of ks) if (await (await caches.open(k)).match("${CONCEPT}")) return true; return false; })`, "概念页进入缓存");

    offline = true;
    await new Promise((resolve) => {
      server.closeAllConnections();
      server.close(resolve);
    });
    await goto(CONCEPT, "离线回放");
    await expectH1(/^道/);
    await hydrated();
    current = "离线未缓存页";
    await cdp("Page.navigate", { url: base + "/quotes/" });
    await waitFor(`document.readyState === "complete" && /离线|网络/.test(document.body?.innerText ?? "") && !document.querySelector("nav a[href='/chapters/']")`, "未缓存页面落到离线页");
    await sleep(300);
  } catch (err) {
    fail(`脚本异常: ${err.stack ?? err}`);
  } finally {
    chrome.close();
    if (server.listening) server.close();
  }

  if (problems.length) {
    console.error(`\n❌ 冒烟失败（${problems.length} 项）`);
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }
  console.log("\n✅ 浏览器冒烟全部通过");
  process.exit(0);
}

main();
