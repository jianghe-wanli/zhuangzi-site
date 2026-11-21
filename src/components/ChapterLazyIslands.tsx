"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

import { subscribePassageClass } from "@/lib/passage-dom";

import type { ScholarMarginNotesProps } from "./ScholarMarginNotes";

/**
 * 篇章页「用到才加载」的客户端岛外壳。
 *
 * 朱批合参栏、划词菜单、批注面板三者首屏都不可见（或只是一枚按钮），
 * 代码却随篇章页首屏下载并水合。这里各留一个极小的外壳监听触发条件，
 * 真正的组件在首次需要时才动态加载。
 */

/* ---------- 朱批合参（ScholarMarginNotes） ---------- */

const SCHOLAR_BUTTON_CLASS =
  "fixed left-0 top-1/3 z-30 2xl:hidden bg-[var(--bg-card)] border-y border-r border-[var(--color-accent-vermilion)]/40 rounded-r-lg shadow-md px-1.5 py-3 text-xs font-serif text-[var(--color-accent-vermilion)] hover:bg-[var(--hover-bg)] transition-all flex flex-col items-center gap-1 cursor-pointer select-none";

/** 与 ScholarMarginNotes 里的朱印按钮同形（加载前 / 加载中的占位，点击即触发加载并打开抽屉） */
function ScholarButton({ onClick }: { onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className={SCHOLAR_BUTTON_CLASS} aria-label="打开朱批合参伴读抽屉" title="朱批合参">
      <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent-vermilion)]" />
      <span style={{ writingMode: "vertical-rl" }} className="tracking-widest">
        朱批合参
      </span>
    </button>
  );
}

const ScholarMarginNotes = dynamic(() => import("./ScholarMarginNotes"), {
  ssr: false,
  loading: () => <ScholarButton />,
});

/**
 * 窄屏（<1536px）：只渲染朱印按钮，点击才加载面板。
 * 宽屏（≥1536px）：常驻侧栏，页面空闲后加载。
 */
export function ScholarMarginNotesLazy(props: ScholarMarginNotesProps) {
  const [load, setLoad] = useState<null | { open: boolean }>(null);
  const lastTerm = useRef<string | null>(null);

  useEffect(() => {
    if (load) return;
    const mql = window.matchMedia("(min-width: 1536px)");
    let idle = 0;
    const check = () => {
      if (!mql.matches || idle) return;
      const run = () => setLoad((v) => v ?? { open: false });
      // Safari 没有 requestIdleCallback
      idle = window.setTimeout(run, 1200);
    };
    check();
    mql.addEventListener("change", check);
    // 加载前记下用户最后聚焦的注词，面板加载后直接显示它
    const onTerm = (e: Event) => {
      const term = (e as CustomEvent<{ term?: string }>).detail?.term;
      if (term) lastTerm.current = term;
    };
    window.addEventListener("zhuangzi:focus-term", onTerm);
    return () => {
      mql.removeEventListener("change", check);
      window.removeEventListener("zhuangzi:focus-term", onTerm);
      window.clearTimeout(idle);
    };
  }, [load]);

  if (!load) return <ScholarButton onClick={() => setLoad({ open: true })} />;
  // eslint-disable-next-line react-hooks/refs -- 只在首次挂载时读一次，作为初始值
  return <ScholarMarginNotes {...props} initialDrawerOpen={load.open} initialTerm={lastTerm.current} />;
}

/* ---------- 划词菜单（SelectionPopover） ---------- */

const SelectionPopover = dynamic(() => import("./SelectionPopover"), { ssr: false, loading: () => null });

/** 首次在原文 / 译文里选中文字时才加载划词菜单 */
export function SelectionPopoverLazy(props: { chapterId: string; chapterTitle: string }) {
  const [load, setLoad] = useState(false);

  useEffect(() => {
    if (load) return;
    const onSelection = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) return;
      const node = sel.focusNode;
      const el = node instanceof Element ? node : node?.parentElement;
      if (el?.closest(".original-text, .translation-text")) setLoad(true);
    };
    document.addEventListener("selectionchange", onSelection);
    return () => document.removeEventListener("selectionchange", onSelection);
  }, [load]);

  return load ? <SelectionPopover {...props} /> : null;
}

/* ---------- 批注面板（AnnotationPanel） ---------- */

const AnnotationPanel = dynamic(() => import("./AnnotationPanel"), { ssr: false, loading: () => null });

/**
 * 批注面板槽位：段落根节点首次切到 .annotation-on 时才挂载面板
 * （此前每段都直出一个隐藏的面板：逍遥游 8 段共 80 个 DOM 节点、8 个 textarea）。
 * 挂载后保留，显示 / 隐藏仍由 CSS 控制。
 */
export function AnnotationSlot({ chapterId, passageId }: { chapterId: string; passageId: string }) {
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mounted) return;
    const root = ref.current?.closest("[data-passage-root]");
    if (!root) return;
    const update = () => {
      if (root.classList.contains("annotation-on")) setMounted(true);
    };
    update();
    return subscribePassageClass(root, update);
  }, [mounted]);

  return (
    <div ref={ref} className="annotation-panel">
      {mounted && <AnnotationPanel chapterId={chapterId} passageId={passageId} />}
    </div>
  );
}
