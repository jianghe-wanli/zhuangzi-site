"use client";

import { useEffect } from "react";

import { blocksSrcForPath, prefetchBlocks } from "./StaticBlock";

/**
 * 静态块预取（挂在根布局，全站生效，无 UI）。
 *
 * 篇章页 / 概念页的正文不在 RSC 载荷里，客户端路由进入时要另取 blocks.json。
 * 这里在用户对站内链接表现出意图时（悬停、触摸、键盘聚焦，以及点击本身）
 * 立即开始取，让它与 RSC 载荷并行到达 —— 否则要等 RSC 渲染出 StaticBlock 才发请求，
 * 多一个串行往返。
 *
 * 不做「进入视口即预取」：/chapters 一屏有 33 个链接，每个 blocks.json 约 25 KB（gzip），
 * 全取要近 1 MB；本站 <Link> 也都关着视口预取。
 */
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
      prefetchBlocks(src);
    };
    const opts = { capture: true, passive: true } as const;
    const events = ["mouseover", "touchstart", "focusin", "click"] as const;
    for (const ev of events) document.addEventListener(ev, onIntent, opts);
    return () => {
      for (const ev of events) document.removeEventListener(ev, onIntent, opts);
    };
  }, []);
  return null;
}
