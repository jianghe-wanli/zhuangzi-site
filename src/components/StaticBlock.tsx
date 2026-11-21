"use client";

import { useRouter } from "next/navigation";
import { createElement, type MouseEvent, type SyntheticEvent, use, useEffect, useState } from "react";

import { type Blocks, captured, fetchBlocks, type Html, intendedHash, known, pending } from "@/lib/static-blocks-client";

/** 与 src/lib/static-html.ts 的 STATIC_BLOCKS_KEY 相同（那边是 server-only，不能 import） */
const REGISTRY_KEY = Symbol.for("zhuangzi.static-blocks");
const EMPTY: Html = { __html: "" };
/** 经 blocks.json 取回后才挂载的页面，补一次锚点滚动（见下） */
let hashHandledFor = "";

const RELOAD_GUARD = "zhuangzi:sb-reload";
/** 取回失败且已经整页重载过一次的 src：改为在页内给出提示，绝不再次重载 */
const failed = new Set<string>();

/** 渲染期等待用的 promise（每个 src 一个，身份稳定 —— React 的 use() 要求如此） */
const loading = new Map<string, Promise<Blocks>>();

function loadBlocks(src: string): Promise<Blocks> {
  const existing = loading.get(src);
  if (existing) return existing;
  // 预取在途或已完成就接着用；没有预取，或预取失败了，（再）取一次
  const first = pending.get(src) ?? fetchBlocks(src);
  const p = first.catch(() => fetchBlocks(src)).catch(() => {
    // 取不到（离线且未缓存 / 部署切换后旧页面取新产物）：退回整页加载目标页，由 HTML 直出正文。
    // 注意此刻客户端导航多半还没提交（transition 挂起中，地址栏仍是来源页），
    // 所以不能 location.reload() —— 那会把用户留在来源页；要显式前往目标页。
    // 整页加载后的文档要么是目标页 HTML（正文已在 DOM 里，不再取 blocks.json），
    // 要么是 Service Worker 的离线页（没有 StaticBlock）—— 两者都不会再走到这里。
    // 仍加一道 sessionStorage 保险：同一目标 30 秒内只整页加载一次，杜绝任何刷新循环。
    const target = src.replace(/blocks\.json$/, "");
    try {
      const [url, at] = (sessionStorage.getItem(RELOAD_GUARD) ?? "").split("|");
      if (url === target && Date.now() - Number(at) < 30_000) {
        failed.add(src);
        return {} as Blocks;
      }
      sessionStorage.setItem(RELOAD_GUARD, `${target}|${Date.now()}`);
    } catch {
      // sessionStorage 不可用（隐私模式等）：无法防循环，就不整页加载，直接页内提示
      failed.add(src);
      return {} as Blocks;
    }
    if (window.location.pathname === target) window.location.reload();
    else window.location.assign(target + (intendedHash.get(src) ?? ""));
    return new Promise<Blocks>(() => {});
  });
  loading.set(src, p);
  pending.set(src, p);
  return p;
}

const FAILED_HTML: Html = {
  __html:
    '<p role="alert" class="py-16 text-center text-sm text-[var(--text-secondary)]">正文加载失败，请检查网络后<a href="" class="underline text-[var(--text-accent)]">重新加载本页</a>。</p>',
};
/** 每个 src 只让一个块显示失败提示 */
const failureOwner = new Map<string, string>();

/** 返回 null = 需经 blocks.json 取回；ABSENT = ssrOnly 块在客户端路由下不渲染 */
const ABSENT: Html = { __html: "" };

function initialHtml(src: string, key: string, ssrOnly: boolean | undefined): Html | null {
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
  //
  // 采集发生在水合的 render 阶段，早于本页任何 effect（句级切分、夹注等改写正文的
  // 逻辑都在 effect 或用户交互里），所以拿到的是服务端原样内容。唯一可能更早的是
  // 导航栏的繁简切换（根布局先于页面水合）：文档已是繁体态时不采集，返回本页时改取 blocks.json。
  // 成本：逍遥游 36 块约 7 万字符，4 倍 CPU 降速下 1–2 ms。
  const el = document.querySelector(`[data-sb="${CSS.escape(key)}"]`);
  if (el) {
    if (!ssrOnly && document.documentElement.lang !== "zh-Hant") {
      known.set(key, { __html: el.innerHTML });
      captured.add(src);
    }
    return EMPTY;
  }
  return ssrOnly ? ABSENT : null;
}

interface StaticBlockProps {
  /** 本页 blocks.json 的站内路径（客户端路由进入时由此取内容） */
  src: string;
  id: string;
  /** 根元素的 DOM id（页内锚点目标）；`id` 只是 blocks.json 里的块名 */
  anchorId?: string;
  as?: string;
  className?: string;
  /** 只在 HTML 直出时有意义的块（如 JSON-LD）：客户端路由进入时不渲染 */
  ssrOnly?: boolean;
  type?: string;
  /** 仅开发模式传入的内容指纹：HMR 改了块内容时据此重取（生产环境恒为 undefined） */
  rev?: string | undefined;
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
export default function StaticBlock({ src, id, anchorId, as = "div", className, ssrOnly, type, rev }: StaticBlockProps) {
  const key = `${src}#${id}`;
  const router = useRouter();
  const [initial] = useState(() => initialHtml(src, key, ssrOnly));
  const [hot, setHot] = useState<Html | null>(null);
  let html = hot ?? initial;
  // 客户端路由进入（不是水合）：内容来自预取缓存或下面的 Suspense 等待
  const clientEntered = initial !== EMPTY;
  if (!html) {
    use(loadBlocks(src));
    html = known.get(key) ?? EMPTY;
    if (failed.has(src)) {
      if (!failureOwner.has(src)) failureOwner.set(src, id);
      html = failureOwner.get(src) === id ? FAILED_HTML : EMPTY;
    }
  }

  // 开发模式 HMR：服务端块内容变了（rev 变化）而本组件 props 之外没有任何东西会更新，
  // 这里重取一次 blocks.json 换上新内容。生产环境 rev 恒为 undefined，不会执行。
  const [seenRev, setSeenRev] = useState(rev);
  useEffect(() => {
    if (rev === seenRev || ssrOnly) return;
    let cancelled = false;
    void fetchBlocks(src, { cache: "no-store" }).then(
      () => {
        if (cancelled) return;
        setSeenRev(rev);
        setHot(known.get(key) ?? EMPTY);
      },
      () => {}
    );
    return () => {
      cancelled = true;
    };
  }, [rev, seenRev, src, key, ssrOnly]);

  // 经 Suspense 等待后才出现的页面：Next 的锚点滚动发生在骨架屏阶段
  // （目标尚不存在），这里在内容就位后补一次。
  useEffect(() => {
    if (!clientEntered || !window.location.hash) return;
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
  }, [clientEntered, src]);

  /** 块内站内链接（普通 <a>）的地址；不是可接管的站内链接则返回 null */
  const internalLink = (e: SyntheticEvent<HTMLElement>): string | null => {
    const a = (e.target as Element).closest?.("a[href]");
    if (!a || !e.currentTarget.contains(a) || a.hasAttribute("download") || a.getAttribute("target")) return null;
    const href = a.getAttribute("href") ?? "";
    return href.startsWith("/") && !href.startsWith("//") ? href : null;
  };

  const onClick = (e: MouseEvent<HTMLElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const href = internalLink(e);
    if (!href) return;
    e.preventDefault();
    router.push(href);
  };

  if (html === ABSENT) return null;

  return createElement(as, {
    id: anchorId,
    className,
    type,
    "data-sb": key,
    suppressHydrationWarning: true,
    dangerouslySetInnerHTML: html,
    onClick: ssrOnly ? undefined : onClick,
  });
}
