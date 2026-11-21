"use client";

import { useRouter } from "next/navigation";
import { createElement, type MouseEvent, use, useEffect, useState } from "react";

type Html = { __html: string };
type Blocks = Record<string, string>;

/** 与 src/lib/static-html.ts 的 STATIC_BLOCKS_KEY 相同（那边是 server-only，不能 import） */
const REGISTRY_KEY = Symbol.for("zhuangzi.static-blocks");
const EMPTY: Html = { __html: "" };

/** 已知的块内容（水合时从 DOM 采集，或由 blocks.json 取回），键为 `${src}#${id}` */
const known = new Map<string, Html>();
const pending = new Map<string, Promise<Blocks>>();
/** 经 blocks.json 取回后才挂载的页面，补一次锚点滚动（见下） */
let hashHandledFor = "";

function loadBlocks(src: string): Promise<Blocks> {
  let p = pending.get(src);
  if (!p) {
    p = fetch(src)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<Blocks>;
      })
      .then((blocks) => {
        for (const [id, html] of Object.entries(blocks)) known.set(`${src}#${id}`, { __html: html });
        return blocks;
      })
      .catch(() => {
        // 取不到（离线且未缓存 / 部署切换）：退回整页加载，由 HTML 直出正文
        pending.delete(src);
        window.location.reload();
        return new Promise<Blocks>(() => {});
      });
    pending.set(src, p);
  }
  return p;
}

/** 返回 null = 需经 blocks.json 取回；ABSENT = ssrOnly 块在客户端路由下不渲染 */
const ABSENT: Html = { __html: "" };

function initialHtml(key: string, ssrOnly: boolean | undefined): Html | null {
  if (typeof window === "undefined") {
    const reg = (globalThis as unknown as Record<symbol, Map<string, string> | undefined>)[REGISTRY_KEY];
    const html = reg?.get(key);
    // 宁可构建失败也不静默输出空正文
    if (html === undefined) throw new Error(`[StaticBlock] 未登记的静态块：${key}`);
    return { __html: html };
  }
  const cached = known.get(key);
  if (cached) return ssrOnly ? ABSENT : cached;
  // 水合：SSR 直出的节点已在文档里 —— 记下原始内容（供返回本页时同步重建），
  // 本次渲染交给 React 一个空的 innerHTML，React 水合时不比对也不改写它。
  const el = document.querySelector(`[data-sb="${CSS.escape(key)}"]`);
  if (el) {
    if (!ssrOnly) known.set(key, { __html: el.innerHTML });
    return EMPTY;
  }
  return ssrOnly ? ABSENT : null;
}

interface StaticBlockProps {
  /** 本页 blocks.json 的站内路径（客户端路由进入时由此取内容） */
  src: string;
  id: string;
  as?: string;
  className?: string;
  /** 只在 HTML 直出时有意义的块（如 JSON-LD）：客户端路由进入时不渲染 */
  ssrOnly?: boolean;
  type?: string;
}

/**
 * 静态块：内容由 SSR 直出进 HTML，**不进 RSC 载荷**（props 只有标量）。
 *
 * - 首屏：水合时保留服务端 DOM，不创建子 fiber —— 既不重复传输，也不水合。
 * - 客户端路由进入：从同目录 blocks.json 取 HTML（Suspense 等待，
 *   与取 RSC 载荷时的骨架屏一致）。
 * - 块内站内链接是普通 <a>，由本组件委托给 router.push，保持 SPA 导航。
 *
 * 内容生成与登记见 src/lib/static-html.ts。
 */
export default function StaticBlock({ src, id, as = "div", className, ssrOnly, type }: StaticBlockProps) {
  const key = `${src}#${id}`;
  const router = useRouter();
  const [initial] = useState(() => initialHtml(key, ssrOnly));
  let html = initial;
  let fetched = false;
  if (!html) {
    use(loadBlocks(src));
    html = known.get(key) ?? EMPTY;
    fetched = true;
  }

  // 经 Suspense 等待后才出现的页面：Next 的锚点滚动发生在骨架屏阶段
  // （目标尚不存在），这里在内容就位后补一次。
  useEffect(() => {
    if (!fetched || !window.location.hash) return;
    const mark = src + window.location.hash;
    if (hashHandledFor === mark) return;
    hashHandledFor = mark;
    let target: HTMLElement | null = null;
    try {
      target = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
    } catch {
      /* 非法 hash：忽略 */
    }
    target?.scrollIntoView({ block: "start" });
  }, [fetched, src]);

  const onClick = (e: MouseEvent<HTMLElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as Element).closest?.("a[href]");
    if (!a || !e.currentTarget.contains(a) || a.hasAttribute("download") || a.getAttribute("target")) return;
    const href = a.getAttribute("href") ?? "";
    if (!href.startsWith("/") || href.startsWith("//")) return;
    e.preventDefault();
    router.push(href);
  };

  if (html === ABSENT) return null;

  return createElement(as, {
    className,
    type,
    "data-sb": key,
    suppressHydrationWarning: true,
    dangerouslySetInnerHTML: html,
    onClick: ssrOnly ? undefined : onClick,
  });
}
