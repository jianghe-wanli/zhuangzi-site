/**
 * public/sw.js 行为测试。
 *
 * sw.js 是经典脚本（非模块），这里在 node:vm 里加载它，注入最小的
 * self / caches / fetch 仿真，直接驱动 install / activate / fetch 事件。
 * 每条用例都对应一个真实出过或差点出的问题，见各 it 的说明。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

import { beforeEach, describe, expect, it, vi } from "vitest";

const ORIGIN = "https://zhuangzi.test";
const SW_SOURCE = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");

class FakeCache {
  entries = new Map<string, Response>();
  private key(k: string | Request) {
    const url = typeof k === "string" ? k : k.url;
    return new URL(url, ORIGIN).href;
  }
  async match(k: string | Request) {
    return this.entries.get(this.key(k))?.clone();
  }
  async put(k: string | Request, res: Response) {
    const key = this.key(k);
    this.entries.delete(key); // 与规范一致：重复 put 会移到末尾
    this.entries.set(key, res);
  }
  async delete(k: string | Request) {
    return this.entries.delete(this.key(k));
  }
  async keys() {
    return [...this.entries.keys()].map((url) => ({ url }));
  }
}

class FakeCacheStorage {
  stores = new Map<string, FakeCache>();
  async open(name: string) {
    let c = this.stores.get(name);
    if (!c) this.stores.set(name, (c = new FakeCache()));
    return c;
  }
  async keys() {
    return [...this.stores.keys()];
  }
  async delete(name: string) {
    return this.stores.delete(name);
  }
}

type Handler = (event: unknown) => void;
type FetchImpl = (input: string | Request, init?: RequestInit) => Promise<Response>;

interface Harness {
  caches: FakeCacheStorage;
  listeners: Map<string, Handler>;
  setFetch(impl: FetchImpl): void;
  fetchCalls: string[];
  /** 派发 fetch 事件；返回 undefined 表示 SW 未接管（走浏览器默认） */
  dispatchFetch(
    path: string,
    init?: { mode?: string; headers?: Record<string, string>; method?: string; preload?: Response }
  ): Promise<Response | undefined>;
  dispatchLifecycle(type: "install" | "activate"): Promise<void>;
  skipWaitingCalls: number;
}

function createHarness(): Harness {
  const caches = new FakeCacheStorage();
  const listeners = new Map<string, Handler>();
  let fetchImpl: FetchImpl = async () => {
    throw new TypeError("offline");
  };
  const h: Harness = {
    caches,
    listeners,
    fetchCalls: [],
    skipWaitingCalls: 0,
    setFetch(impl) {
      fetchImpl = impl;
    },
    async dispatchFetch(path, init = {}) {
      const request = new Request(new URL(path, ORIGIN), {
        method: init.method ?? "GET",
        headers: init.headers ?? {},
      });
      // Request.mode 在 undici 里不能设为 navigate，用代理补上
      const proxied = new Proxy(request, {
        get(target, prop) {
          if (prop === "mode") return init.mode ?? "cors";
          const v = Reflect.get(target, prop, target);
          return typeof v === "function" ? v.bind(target) : v;
        },
      });
      let responded: Promise<Response> | undefined;
      const pending: Promise<unknown>[] = [];
      listeners.get("fetch")?.({
        request: proxied,
        preloadResponse: Promise.resolve(init.preload),
        respondWith(p: Promise<Response>) {
          responded = Promise.resolve(p);
        },
        waitUntil(p: Promise<unknown>) {
          pending.push(Promise.resolve(p).catch(() => {}));
        },
      });
      if (!responded) return undefined;
      const res = await responded;
      // waitUntil 里可能再登记新的 promise，循环直到清空
      for (let i = 0; i < pending.length; i++) await pending[i];
      return res;
    },
    async dispatchLifecycle(type) {
      const pending: Promise<unknown>[] = [];
      listeners.get(type)?.({ waitUntil: (p: Promise<unknown>) => pending.push(p) });
      await Promise.all(pending);
    },
  };

  const self = {
    location: new URL(ORIGIN),
    addEventListener: (type: string, fn: Handler) => listeners.set(type, fn),
    skipWaiting: async () => {
      h.skipWaitingCalls++;
    },
    clients: { claim: async () => {} },
    registration: { navigationPreload: { enable: async () => {} } },
  };
  const context = vm.createContext({
    self,
    caches,
    fetch: (input: string | Request, init?: RequestInit) => {
      h.fetchCalls.push(typeof input === "string" ? input : new URL(input.url).pathname);
      return fetchImpl(input, init);
    },
    Response,
    Request,
    URL,
    Promise,
    Set,
    setTimeout,
    clearTimeout,
  });
  vm.runInContext(SW_SOURCE, context, { filename: "sw.js" });
  return h;
}

const html = (body: string) =>
  new Response(body, { status: 200, headers: { "Content-Type": "text/html" } });
const offline: FetchImpl = async () => {
  throw new TypeError("offline");
};

function cacheNames(h: Harness, prefix: string) {
  return [...h.caches.stores.keys()].filter((k) => k.startsWith(prefix));
}
async function cacheUrls(h: Harness, prefix: string) {
  const out: string[] = [];
  for (const name of cacheNames(h, prefix)) {
    for (const k of await (await h.caches.open(name)).keys()) out.push(new URL(k.url).pathname);
  }
  return out;
}

describe("Service Worker（public/sw.js）", () => {
  let h: Harness;
  beforeEach(() => {
    h = createHarness();
  });

  it("缓存命名：带版本号的都能被 bump-sw-version 的正则替换，immutable 不带版本", () => {
    const names = [...SW_SOURCE.matchAll(/"(zhuangzi-[a-z]+(?:-v\d+)?)"/g)].map((m) => m[1]);
    expect(names).toContain("zhuangzi-immutable");
    const versioned = names.filter((n) => n !== "zhuangzi-immutable");
    expect(versioned.length).toBeGreaterThanOrEqual(5);
    for (const n of versioned) expect(n).toMatch(/^zhuangzi-[a-z]+-v1$/);
  });

  it("install：预缓存离线页并 skipWaiting；重定向过的响应不入缓存", async () => {
    h.setFetch(async (input) => {
      const url = String(input);
      if (url === "/offline/") return html("<title>离线</title>OFFLINE");
      return new Response("nope", { status: 404 });
    });
    await h.dispatchLifecycle("install");
    expect(await cacheUrls(h, "zhuangzi-shell-")).toEqual(["/offline/"]);
    expect(h.skipWaitingCalls).toBe(1);

    const h2 = createHarness();
    h2.setFetch(async () => {
      const res = html("redirected");
      Object.defineProperty(res, "redirected", { value: true });
      return res;
    });
    await h2.dispatchLifecycle("install");
    expect(await cacheUrls(h2, "zhuangzi-shell-")).toEqual([]);
  });

  it("activate：清掉旧版本缓存，保留当前版本与 immutable，不碰别家缓存", async () => {
    for (const n of [
      "zhuangzi-static-OLDBUILD",
      "zhuangzi-pages-OLDBUILD",
      "zhuangzi-immutable",
      "zhuangzi-pages-v1",
      "other-app-cache",
    ]) {
      await h.caches.open(n);
    }
    await h.dispatchLifecycle("activate");
    const left = await h.caches.keys();
    expect(left).toContain("zhuangzi-immutable");
    expect(left).toContain("zhuangzi-pages-v1");
    expect(left).toContain("other-app-cache");
    expect(left).not.toContain("zhuangzi-static-OLDBUILD");
    expect(left).not.toContain("zhuangzi-pages-OLDBUILD");
  });

  it("不接管：非 GET、跨域、/api/、sw.js 自身、Range 请求", async () => {
    h.setFetch(async () => html("x"));
    expect(await h.dispatchFetch("/api/chat")).toBeUndefined();
    expect(await h.dispatchFetch("/sw.js")).toBeUndefined();
    expect(await h.dispatchFetch("/chapters/", { method: "POST", mode: "navigate" })).toBeUndefined();
    expect(await h.dispatchFetch("https://webrd01.is.autonavi.com/appmaptile?x=1")).toBeUndefined();
    expect(
      await h.dispatchFetch("/fonts/slices/a.woff2", { headers: { Range: "bytes=0-10" } })
    ).toBeUndefined();
    expect(h.fetchCalls).toEqual([]);
  });

  it("/_next/static/* 进不带版本的 immutable 缓存，第二次不再走网络", async () => {
    h.setFetch(async () => new Response("js", { status: 200 }));
    const a = await h.dispatchFetch("/_next/static/chunks/abc.js");
    expect(await a?.text()).toBe("js");
    expect(await cacheUrls(h, "zhuangzi-immutable")).toEqual(["/_next/static/chunks/abc.js"]);
    h.setFetch(offline);
    const b = await h.dispatchFetch("/_next/static/chunks/abc.js");
    expect(await b?.text()).toBe("js");
  });

  it("字体 / 图片进带版本的 static 缓存（文件名不带哈希，须随发版失效）", async () => {
    h.setFetch(async () => new Response("font", { status: 200 }));
    await h.dispatchFetch("/fonts/slices/zhuangzi-cls-00.woff2");
    await h.dispatchFetch("/og/chapters/01-xiaoyao-you.png");
    expect((await cacheUrls(h, "zhuangzi-static-")).sort()).toEqual([
      "/fonts/slices/zhuangzi-cls-00.woff2",
      "/og/chapters/01-xiaoyao-you.png",
    ]);
    expect(await cacheUrls(h, "zhuangzi-immutable")).toEqual([]);
  });

  it("4xx/5xx、opaque、206 响应不入缓存", async () => {
    h.setFetch(async () => new Response("missing", { status: 404 }));
    const res = await h.dispatchFetch("/_next/static/chunks/gone.js");
    expect(res?.status).toBe(404);
    h.setFetch(async () => new Response("part", { status: 206 }));
    await h.dispatchFetch("/icon.svg");
    expect(await cacheUrls(h, "zhuangzi-")).toEqual([]);
  });

  it("静态资源离线且无缓存 → 如实失败（Response.error）", async () => {
    h.setFetch(offline);
    const res = await h.dispatchFetch("/_next/static/chunks/none.js");
    expect(res?.type).toBe("error");
  });

  it("JSON：Stale-While-Revalidate —— 先回旧值，后台刷新为新值", async () => {
    h.setFetch(async () => new Response('{"v":1}', { status: 200 }));
    expect(await (await h.dispatchFetch("/data/translations/01.json"))?.text()).toBe('{"v":1}');
    h.setFetch(async () => new Response('{"v":2}', { status: 200 }));
    expect(await (await h.dispatchFetch("/data/translations/01.json"))?.text()).toBe('{"v":1}');
    expect(await (await h.dispatchFetch("/data/translations/01.json"))?.text()).toBe('{"v":2}');
    h.setFetch(offline);
    expect(await (await h.dispatchFetch("/data/translations/01.json"))?.text()).toBe('{"v":2}');
    expect((await h.dispatchFetch("/data/translations/never.json"))?.type).toBe("error");
  });

  it("页面导航：Network-First，离线回退已访问页；缓存键忽略 query", async () => {
    h.setFetch(async () => html("chapter-1"));
    const online = await h.dispatchFetch("/chapters/01-xiaoyao-you/?from=home", { mode: "navigate" });
    expect(await online?.text()).toBe("chapter-1");
    expect(await cacheUrls(h, "zhuangzi-pages-")).toEqual(["/chapters/01-xiaoyao-you/"]);

    h.setFetch(offline);
    const cached = await h.dispatchFetch("/chapters/01-xiaoyao-you/?p=3", { mode: "navigate" });
    expect(cached?.status).toBe(200);
    expect(await cached?.text()).toBe("chapter-1");
  });

  it("页面导航：/search/?q=… 不同查询只占一条缓存", async () => {
    h.setFetch(async () => html("search"));
    for (const q of ["a", "b", "c"]) await h.dispatchFetch(`/search/?q=${q}`, { mode: "navigate" });
    expect(await cacheUrls(h, "zhuangzi-pages-")).toEqual(["/search/"]);
  });

  it("页面导航：优先使用 navigation preload 的响应，不重复请求", async () => {
    h.setFetch(async () => html("from-fetch"));
    const res = await h.dispatchFetch("/quotes/", { mode: "navigate", preload: html("from-preload") });
    expect(await res?.text()).toBe("from-preload");
    expect(h.fetchCalls).toEqual([]);
  });

  it("离线且未缓存 → 503 离线页（不是 404 页）", async () => {
    h.setFetch(async (input) =>
      String(input) === "/offline/" ? html("<title>离线</title>OFFLINE-PAGE") : new Response("", { status: 404 })
    );
    await h.dispatchLifecycle("install");
    h.setFetch(offline);
    const res = await h.dispatchFetch("/fables/", { mode: "navigate" });
    expect(res?.status).toBe(503);
    expect(res?.headers.get("content-type")).toContain("text/html");
    expect(await res?.text()).toContain("OFFLINE-PAGE");
  });

  it("离线页未预缓存成功时仍有内联兜底", async () => {
    h.setFetch(offline);
    const res = await h.dispatchFetch("/fables/", { mode: "navigate" });
    expect(res?.status).toBe(503);
    expect(await res?.text()).toContain("離線");
  });

  it("访问超过上限的页面后，离线页不会被裁剪掉（曾与页面同缓存、最先被淘汰）", async () => {
    h.setFetch(async (input) => html(String(input) === "/offline/" ? "OFFLINE-PAGE" : "page"));
    await h.dispatchLifecycle("install");
    for (let i = 0; i < 45; i++) await h.dispatchFetch(`/p${i}/`, { mode: "navigate" });
    const pages = await cacheUrls(h, "zhuangzi-pages-");
    expect(pages.length).toBe(40);
    expect(pages).not.toContain("/p0/"); // 最旧的被淘汰
    expect(pages).toContain("/p44/");
    h.setFetch(offline);
    const res = await h.dispatchFetch("/never-visited/", { mode: "navigate" });
    expect(await res?.text()).toBe("OFFLINE-PAGE");
  });

  it("RSC 载荷：Network-First 并入缓存，离线时客户端导航可用；?_rsc= 不影响命中", async () => {
    h.setFetch(async () => new Response("RSC-PAYLOAD", { status: 200 }));
    const a = await h.dispatchFetch("/chapters/02-qiwu-lun/index.txt?_rsc=abc12", {
      headers: { RSC: "1" },
    });
    expect(await a?.text()).toBe("RSC-PAYLOAD");
    await h.dispatchFetch("/chapters/__next.chapters.__PAGE__.txt?_rsc=zzz");
    expect((await cacheUrls(h, "zhuangzi-rsc-")).sort()).toEqual([
      "/chapters/02-qiwu-lun/index.txt",
      "/chapters/__next.chapters.__PAGE__.txt",
    ]);

    h.setFetch(offline);
    const b = await h.dispatchFetch("/chapters/02-qiwu-lun/index.txt?_rsc=other", {
      headers: { RSC: "1" },
    });
    expect(await b?.text()).toBe("RSC-PAYLOAD");
    // 没缓存的 RSC 请求如实失败，Next 路由器会退回整页导航
    const c = await h.dispatchFetch("/concepts/dao/index.txt?_rsc=q", { headers: { RSC: "1" } });
    expect(c?.type).toBe("error");
  });

  it("robots.txt 等普通 .txt 不被当作 RSC 载荷接管", async () => {
    h.setFetch(async () => new Response("User-agent: *"));
    expect(await h.dispatchFetch("/robots.txt")).toBeUndefined();
  });

  it("响应不等缓存写入：cache.put 挂起时响应仍立即返回", async () => {
    h.setFetch(async () => new Response("js", { status: 200 }));
    const immutable = await h.caches.open("zhuangzi-immutable");
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const origPut = immutable.put.bind(immutable);
    immutable.put = async (k, res) => {
      await gate;
      return origPut(k, res);
    };

    let responded: Promise<Response> | undefined;
    const pending: Promise<unknown>[] = [];
    h.listeners.get("fetch")?.({
      request: new Request(`${ORIGIN}/_next/static/chunks/slow.js`),
      preloadResponse: Promise.resolve(undefined),
      respondWith: (p: Promise<Response>) => (responded = p),
      waitUntil: (p: Promise<unknown>) => pending.push(p),
    });
    const res = await responded; // 若实现 await 了 put，这里会一直挂起直到超时
    expect(await res?.text()).toBe("js");
    expect(immutable.entries.size).toBe(0);
    release();
    await Promise.all(pending);
    expect(immutable.entries.size).toBe(1);
  });

  it("带内容哈希的字体分片进 immutable 缓存，发版（activate）后仍在；未带哈希的不进", async () => {
    h.setFetch(async () => new Response("font", { status: 200 }));
    await h.dispatchFetch("/fonts/slices/zhuangzi-cls-07.1a2b3c4d.woff2");
    await h.dispatchFetch("/fonts/slices/zhuangzi-cls-07.woff2");
    await h.dispatchFetch("/fonts/other.deadbeef.woff2"); // 不在 slices/ 下：不认
    expect(await cacheUrls(h, "zhuangzi-immutable")).toEqual(["/fonts/slices/zhuangzi-cls-07.1a2b3c4d.woff2"]);
    expect((await cacheUrls(h, "zhuangzi-static-")).sort()).toEqual([
      "/fonts/other.deadbeef.woff2",
      "/fonts/slices/zhuangzi-cls-07.woff2",
    ]);
    await h.caches.open("zhuangzi-static-OLDBUILD");
    await h.dispatchLifecycle("activate");
    expect(await cacheUrls(h, "zhuangzi-immutable")).toHaveLength(1);
    h.setFetch(offline);
    expect(await (await h.dispatchFetch("/fonts/slices/zhuangzi-cls-07.1a2b3c4d.woff2"))?.text()).toBe("font");
  });

  describe("按需 JSON（blocks.json / 每日译文 / 搜索索引）", () => {
    const json = (v: unknown) =>
      new Response(JSON.stringify(v), { status: 200, headers: { "Content-Type": "application/json" } });

    it("**/blocks.json：Network-First —— 在线永远拿新版本（不能旧块配新 RSC 载荷）", async () => {
      h.setFetch(async () => json({ build: 1 }));
      expect(await (await h.dispatchFetch("/chapters/01-xiaoyao-you/blocks.json"))?.json()).toEqual({ build: 1 });
      h.setFetch(async () => json({ build: 2 }));
      // SWR 在这里会先回 build 1
      expect(await (await h.dispatchFetch("/chapters/01-xiaoyao-you/blocks.json"))?.json()).toEqual({ build: 2 });
      expect(await cacheUrls(h, "zhuangzi-blocks-")).toEqual(["/chapters/01-xiaoyao-you/blocks.json"]);
      expect(await cacheUrls(h, "zhuangzi-json-")).toEqual([]);
    });

    it("**/blocks.json：任意路由层级都按同一策略；离线回退缓存", async () => {
      h.setFetch(async () => json({ ok: true }));
      for (const p of ["/concepts/dao/blocks.json", "/fables/blocks.json", "/a/b/c/blocks.json"]) {
        await h.dispatchFetch(p);
      }
      h.setFetch(offline);
      for (const p of ["/concepts/dao/blocks.json", "/fables/blocks.json", "/a/b/c/blocks.json"]) {
        expect(await (await h.dispatchFetch(p))?.json(), p).toEqual({ ok: true });
      }
      // 文件名只是以 blocks.json 结尾的不算
      await h.dispatchFetch("/data/myblocks.json").catch(() => {});
      expect(await cacheUrls(h, "zhuangzi-blocks-")).toHaveLength(3);
    });

    it("blocks.json 404（该路由没有静态块）不入缓存", async () => {
      h.setFetch(async () => new Response("<html>404</html>", { status: 404 }));
      expect((await h.dispatchFetch("/quotes/blocks.json"))?.status).toBe(404);
      expect(await cacheUrls(h, "zhuangzi-blocks-")).toEqual([]);
    });

    it("离线且 blocks.json 未缓存 → 如实失败；页面 reload 后拿到缓存整页，不会刷新循环", async () => {
      // 整页访问过（HTML 已缓存），但从未经客户端路由进入 → 没有 blocks.json 缓存
      h.setFetch(async () => html("full-chapter-html"));
      await h.dispatchFetch("/chapters/02-qiwu-lun/", { mode: "navigate" });
      h.setFetch(offline);
      // 客户端路由进入 → fetch blocks.json 失败（页面随即 location.reload()）
      expect((await h.dispatchFetch("/chapters/02-qiwu-lun/blocks.json"))?.type).toBe("error");
      // reload = 导航请求 → 缓存的整页 HTML（自带正文，不再请求 blocks.json）
      const reloaded = await h.dispatchFetch("/chapters/02-qiwu-lun/", { mode: "navigate" });
      expect(reloaded?.status).toBe(200);
      expect(await reloaded?.text()).toBe("full-chapter-html");
    });

    it("离线、blocks.json 与整页都未缓存 → reload 落到 503 离线页（同样不循环）", async () => {
      h.setFetch(async () => html("<title>离线</title>"));
      await h.dispatchLifecycle("install");
      h.setFetch(offline);
      expect((await h.dispatchFetch("/concepts/wuwei/blocks.json"))?.type).toBe("error");
      const reloaded = await h.dispatchFetch("/concepts/wuwei/", { mode: "navigate" });
      expect(reloaded?.status).toBe(503);
      expect(await reloaded?.text()).toContain("离线");
    });

    it("慢网：blocks.json 超过 4 秒未返回且有缓存 → 先用缓存，网络回来后更新缓存", async () => {
      vi.useFakeTimers();
      try {
        h = createHarness(); // vm 上下文在创建时捕获 setTimeout，须在假时钟下重建
        h.setFetch(async () => json({ build: 1 }));
        await h.dispatchFetch("/chapters/03-yangsheng-zhu/blocks.json");
        let release!: (r: Response) => void;
        h.setFetch(() => new Promise<Response>((r) => (release = r)));
        const pending = h.dispatchFetch("/chapters/03-yangsheng-zhu/blocks.json");
        await vi.advanceTimersByTimeAsync(4100);
        release(json({ build: 2 }));
        expect(await (await pending)?.json()).toEqual({ build: 1 });
      } finally {
        vi.useRealTimers();
      }
      h.setFetch(offline);
      expect(await (await h.dispatchFetch("/chapters/03-yangsheng-zhu/blocks.json"))?.json()).toEqual({ build: 2 });
    });

    it("/daily-translations.json 与 /data/search-index.json：SWR，离线可用，取不到如实失败", async () => {
      h.setFetch(async () => json({ v: 1 }));
      for (const p of ["/daily-translations.json", "/data/search-index.json"]) {
        expect(await (await h.dispatchFetch(p))?.json()).toEqual({ v: 1 });
      }
      expect((await cacheUrls(h, "zhuangzi-json-")).sort()).toEqual([
        "/daily-translations.json",
        "/data/search-index.json",
      ]);
      h.setFetch(offline);
      for (const p of ["/daily-translations.json", "/data/search-index.json"]) {
        expect(await (await h.dispatchFetch(p))?.json()).toEqual({ v: 1 });
      }
      // 搜索索引取不到时页面会回退到全量 chunk，这里必须是失败而不是伪造的空 JSON
      const fresh = createHarness();
      fresh.setFetch(offline);
      expect((await fresh.dispatchFetch("/data/search-index.json"))?.type).toBe("error");
    });
  });

  it("SKIP_WAITING 消息触发 skipWaiting", () => {
    h.listeners.get("message")?.({ data: "SKIP_WAITING" });
    expect(h.skipWaitingCalls).toBe(1);
    h.listeners.get("message")?.({ data: "other" });
    expect(h.skipWaitingCalls).toBe(1);
  });
});
