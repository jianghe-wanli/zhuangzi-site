"use client";

import { useEffect } from "react";

import { blocksSrcForPath, intendedHash, prefetchBlocks } from "@/lib/static-blocks-client";

/**
 * 静态块预取（挂在根布局，全站生效，无 UI）。
 *
 * 篇章页 / 概念页的正文不在 RSC 载荷里，客户端路由进入时要另取 blocks.json。
 * 这里在用户对站内链接表现出意图时（悬停、触摸、键盘聚焦，以及点击本身），
 * 以及 Next 开始取目标页 RSC 载荷时（覆盖 router.push 与前进 / 后退），
 * 立即开始取 blocks.json 和 StaticBlock 的代码 chunk，与 RSC 载荷并行到达 ——
 * 否则是「RSC → 发现要 StaticBlock chunk → 渲染后才取 blocks.json」三个串行往返。
 *
 * 不在这里调 router.prefetch：Next 16 的预取是 4 级串行的分段请求（Fast 3G 下约 2.3 秒），
 * 悬停 300 ms 内点击时帮不上忙，还会与正文抢带宽。
 *
 * 不做「进入视口即预取」：/chapters 一屏有 33 个链接，每个 blocks.json 约 25 KB（gzip），
 * 全取要近 1 MB；本站 <Link> 也都关着视口预取。
 */
const CHAPTER_PAGE = /^\/chapters\/[^/]+/;

/**
 * @param navigating 导航已经发生（点击 / Next 已在取 RSC），而不是仅有意图
 */
function warm(src: string, path: string, navigating: boolean) {
  if (!CHAPTER_PAGE.test(path)) {
    prefetchBlocks(src);
    // 概念页 / 列表页没有别的专属代码：把 StaticBlock 所在的 chunk 也提前取，
    // 否则要等 RSC 载荷到了才发现需要它，又多一个串行往返。
    void import("./StaticBlock");
    return;
  }
  // 篇章页的关键路径是「RSC 载荷头部 → 篇章页专属 chunk」，正文要等 chunk 执行后才用得上。
  // 导航已经开始时让 RSC 先走一小步，避免窄带下正文与 RSC 头部抢带宽、推迟 chunk 的发现
  // （Fast 3G 实测：同时发出时 chunk 请求晚 70 ms，整体慢 2–3%；错开后不慢于基线）。
  if (navigating) window.setTimeout(() => prefetchBlocks(src), 60);
  else prefetchBlocks(src);
}

export default function StaticBlockPrefetch() {
  useEffect(() => {
    const onIntent = (e: Event) => {
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!a) return;
      const href = a.getAttribute("href") ?? "";
      if (!href.startsWith("/") || href.startsWith("//")) return;
      const path = href.split(/[?#]/)[0] ?? "";
      const src = blocksSrcForPath(path);
      if (!src || blocksSrcForPath(window.location.pathname) === src) return;
      if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData && e.type !== "click") return;
      if (e.type === "click") intendedHash.set(src, href.includes("#") ? href.slice(href.indexOf("#")) : "");
      warm(src, path, e.type === "click");
    };
    const opts = { capture: true, passive: true } as const;
    const events = ["mouseover", "touchstart", "focusin", "click"] as const;
    for (const ev of events) document.addEventListener(ev, onIntent, opts);

    // 不经过链接的客户端导航（搜索框、命令面板的 router.push，前进 / 后退）没有任何 DOM 事件可挂。
    // Next 取目标页 RSC 载荷（…/index.txt?_rsc=…）的那一刻就是最早的信号：同时开始取 blocks.json。
    const nativeFetch = window.fetch;
    const hookedFetch: typeof window.fetch = function (this: unknown, input, init) {
      try {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (url.includes("_rsc=")) {
          const u = new URL(url, window.location.href);
          const src = u.origin === window.location.origin ? blocksSrcForPath(u.pathname.replace(/index\.txt$/, "")) : null;
          if (src && blocksSrcForPath(window.location.pathname) !== src) warm(src, u.pathname, true);
        }
      } catch {
        /* 只是预取提示，任何异常都不能影响原请求 */
      }
      return nativeFetch.call(this, input, init);
    };
    window.fetch = hookedFetch;

    return () => {
      for (const ev of events) document.removeEventListener(ev, onIntent, opts);
      if (window.fetch === hookedFetch) window.fetch = nativeFetch;
    };
  }, []);
  return null;
}
