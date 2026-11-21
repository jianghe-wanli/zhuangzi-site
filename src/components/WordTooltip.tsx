"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { KaojuEntry } from "@/lib/kaoju-utils";
import { findKaoju } from "@/lib/kaoju-utils";
import { renderEmphasis } from "@/lib/markup";

/** 篇级考据（陈鼓应词条）模块级缓存：每个篇只 fetch 一次 */
const kaojuCache = new Map<string, Promise<KaojuEntry[]>>();
function loadChapterKaoju(chapterId: string): Promise<KaojuEntry[]> {
  let p = kaojuCache.get(chapterId);
  if (!p) {
    p = fetch(`/data/kaoju/${chapterId}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.entries?.chen ?? [])
      .catch(() => []);
    kaojuCache.set(chapterId, p);
  }
  return p;
}

const TRIGGER = "button[data-anno]";
const TOOLTIP_ID = "word-tooltip";

interface Active {
  el: HTMLButtonElement;
  term: string;
  text: string;
}

function triggerOf(target: EventTarget | null): HTMLButtonElement | null {
  return target instanceof Element ? target.closest<HTMLButtonElement>(TRIGGER) : null;
}

/**
 * 词语注释浮层 —— 全站阅读体验的核心交互。
 *
 * 页面级**单实例**：注释词本身是服务端直出的静态 <button data-anno data-term>
 * （见 PassageView），本组件在 document 上做事件委托并渲染唯一的浮层。
 * 原实现每个注释词一个客户端岛（逍遥游 66 个、每个 10+ 个 hook），
 * 既拖慢水合，也让每个词的 props 在 RSC 载荷里再传一遍。
 *
 * 无障碍（WCAG 2.1）保持不变：
 *  - 1.4.13 Content on Hover or Focus：可悬停、可聚焦触发，可 Esc 关闭，
 *    指针移入浮层本身不会关闭（200ms 宽限）。
 *  - 2.1.1 Keyboard：触发器是真正的 <button>，Enter/Space 可切换。
 *  - 4.1.2 Name, Role, Value：aria-expanded / aria-describedby 关联浮层内容。
 *  - 触屏：按钮语义天然支持点击，并有 44px 最小触控高度（见 globals.css）。
 */
export default function WordTooltipLayer({ chapterId }: { chapterId: string }) {
  const [active, setActive] = useState<Active | null>(null);
  const [position, setPosition] = useState({ top: 0, left: 0, below: false, arrowOffset: 0 });
  const [showAll, setShowAll] = useState(false);
  // undefined = 尚未加载；null = 已加载但无命中
  const [kaoju, setKaoju] = useState<KaojuEntry | null | undefined>(undefined);
  const activeRef = useRef<Active | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openedAtRef = useRef(0);

  const show = active !== null;
  const term = active?.term ?? "";
  const text = active?.text ?? "";

  // 打开时懒加载篇级考据并在客户端查找命中条目（findKaoju 是纯函数）。
  // 训诂内容因此不进首屏 HTML/RSC 载荷，只在需要时下载。
  useEffect(() => {
    if (!term) return;
    let cancelled = false;
    loadChapterKaoju(chapterId).then((entries) => {
      if (!cancelled) setKaoju(findKaoju(entries, term));
    });
    return () => {
      cancelled = true;
    };
  }, [chapterId, term]);

  // 激活注词时派发自定义事件，供宽屏左侧「宋刻眉批笺注栏」实时响应联动
  useEffect(() => {
    if (!term) return;
    window.dispatchEvent(
      new CustomEvent("zhuangzi:focus-term", {
        detail: { term, explanation: text, chapterId },
      })
    );
  }, [term, text, chapterId]);

  const updatePosition = useCallback((el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    const isVertical = document.documentElement.classList.contains("vertical-mode");

    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;

    // 视口空间检查：在竖排模式下文字柱纵贯屏幕，rect.bottom 往往接近视口底部，
    // 若下方空间不足 220px（或竖排模式下不足 260px）必须强制向上弹出；
    // 上方空间不足 180px 且下方充足时向下弹出。
    let below = false;
    if (spaceBelow < 220 || (isVertical && spaceBelow < 260)) {
      below = false;
    } else if (spaceAbove < 180) {
      below = true;
    }

    // 浮层宽 288px(w-72) 且以 translateX(-50%) 居中：靠近屏幕左右边缘的注释词
    // 会把浮层推出视口（375px 宽的手机上尤其明显）。
    // 这里把中心点夹紧到「半宽 + 8px 边距」的可用区间内。
    const half = Math.min(288, window.innerWidth - 16) / 2;
    const margin = 8;
    const centreX = rect.left + rect.width / 2;
    const clampedLeft = Math.min(
      Math.max(centreX, half + margin),
      window.innerWidth - half - margin
    );

    // 小三角相对于浮层中心的偏移量：让小三角始终精确指向触发词
    const arrowOffset = Math.max(-110, Math.min(110, centreX - clampedLeft));

    // top 夹紧在 [12, innerHeight - 16] 安全区间内，杜绝弹窗跌出屏幕底缘
    let top = below ? rect.bottom + 8 : rect.top - 8;
    top = Math.max(12, Math.min(window.innerHeight - 16, top));

    setPosition({ top, left: clampedLeft, below, arrowOffset });
  }, []);

  const cancelClose = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);

  const closeNow = useCallback(() => {
    cancelClose();
    const prev = activeRef.current;
    if (!prev) return;
    prev.el.setAttribute("aria-expanded", "false");
    prev.el.removeAttribute("aria-describedby");
    activeRef.current = null;
    setActive(null);
  }, [cancelClose]);

  /** 延迟关闭：允许指针从触发词移入浮层（WCAG 1.4.13 hoverable） */
  const closeSoon = useCallback(() => {
    cancelClose();
    timeoutRef.current = setTimeout(closeNow, 200);
  }, [cancelClose, closeNow]);

  const open = useCallback(
    (el: HTMLButtonElement) => {
      cancelClose();
      updatePosition(el);
      const prev = activeRef.current;
      if (prev?.el === el) return;
      if (prev) {
        prev.el.setAttribute("aria-expanded", "false");
        prev.el.removeAttribute("aria-describedby");
      }
      el.setAttribute("aria-expanded", "true");
      el.setAttribute("aria-describedby", TOOLTIP_ID);
      const next = { el, term: el.dataset.term ?? "", text: el.dataset.anno ?? "" };
      activeRef.current = next;
      openedAtRef.current = performance.now();
      setShowAll(false);
      // 同一个词的另一处出现：考据按词查找，查找 effect 不会重跑，不能清空
      if (prev?.term !== next.term) setKaoju(undefined);
      setActive(next);
    },
    [cancelClose, updatePosition]
  );

  // 事件委托：注释词是静态 HTML，没有各自的 React 事件处理器
  useEffect(() => {
    const onOver = (e: MouseEvent) => {
      const el = triggerOf(e.target);
      if (el && !(e.relatedTarget instanceof Node && el.contains(e.relatedTarget))) open(el);
    };
    const onOut = (e: MouseEvent) => {
      const el = triggerOf(e.target);
      if (el && !(e.relatedTarget instanceof Node && el.contains(e.relatedTarget))) closeSoon();
    };
    const onFocusIn = (e: FocusEvent) => {
      const el = triggerOf(e.target);
      if (el) open(el);
    };
    const onFocusOut = (e: FocusEvent) => {
      if (triggerOf(e.target)) closeSoon();
    };
    const onClick = (e: MouseEvent) => {
      const el = triggerOf(e.target);
      if (!el) return;
      // 触屏一次轻点会连发 mouseover → focus → click：刚被同一手势打开的
      // 浮层不能立刻又被 click 关掉（否则触屏上永远看不到注释）
      if (activeRef.current?.el === el && performance.now() - openedAtRef.current > 350) closeNow();
      else {
        open(el);
        openedAtRef.current = 0; // 由 click 打开的，下一次 click 立即可关
      }
    };
    document.addEventListener("mouseover", onOver);
    document.addEventListener("mouseout", onOut);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseout", onOut);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("click", onClick);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [open, closeSoon, closeNow]);

  // 滚动时关闭（浮层用 fixed 定位，不随内容滚动）
  useEffect(() => {
    if (!show) return;
    window.addEventListener("scroll", closeNow, true);
    return () => window.removeEventListener("scroll", closeNow, true);
  }, [show, closeNow]);

  // WCAG 1.4.13：Esc 必须能关闭浮层，且焦点回到触发元素
  useEffect(() => {
    if (!show) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        const el = activeRef.current?.el;
        closeNow();
        el?.focus();
        // 重新聚焦会触发 focusin → 再次打开；Esc 的语义是关闭
        closeNow();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [show, closeNow]);

  const citations = kaoju?.citations ?? [];
  const visibleCites = showAll ? citations : citations.slice(0, 2);

  const tooltip = show ? (
    <div
      id={TOOLTIP_ID}
      role="tooltip"
      className="fixed z-[9999] w-[min(18rem,calc(100vw-1rem))] sm:w-80 max-h-[70vh] overflow-y-auto p-3 rounded-xl shadow-lg border border-[var(--border-color)] bg-[var(--bg-card)] text-sm leading-relaxed pointer-events-auto"
      style={{
        top: position.top,
        left: position.left,
        transform: position.below ? "translate(-50%, 0)" : "translate(-50%, -100%)",
      }}
      onMouseEnter={cancelClose}
      onMouseLeave={closeSoon}
    >
      <div
        className={`absolute -translate-x-1/2 w-2 h-2 rotate-45 border-r border-b border-[var(--border-color)] bg-[var(--bg-card)] ${
          position.below ? "-top-1 border-t-0 border-l-0" : "top-full -mt-px border-t-0 border-l-0"
        }`}
        style={{ left: `calc(50% + ${position.arrowOffset}px)` }}
      />
      <div className="font-medium text-[var(--text-accent)] mb-1 text-xs tracking-wide">
        「{term}」
      </div>
      <div className="text-[var(--text-primary)] text-xs leading-relaxed"
        dangerouslySetInnerHTML={{ __html: renderEmphasis(text) }}
      />

      {kaoju && (kaoju.explanation || citations.length > 0) && (
        <div className="mt-2 pt-2 border-t border-[var(--border-light)]">
          <div className="text-[10px] font-semibold text-[var(--text-muted)] tracking-[0.08em] mb-1">
            训诂 · 陈鼓应《今注今译》
          </div>
          {kaoju.explanation && (
            <div className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {kaoju.explanation}
            </div>
          )}
          {citations.length > 0 && (
            <div className="mt-1.5 space-y-1.5">
              {visibleCites.map((c, i) => (
                <div key={i} className="text-[11px] text-[var(--text-secondary)] leading-snug">
                  <span className="font-medium text-[var(--text-accent)]">{c.author}</span>
                  <span>：</span>
                  <span>{c.quote.length > 60 ? c.quote.slice(0, 60) + "…" : c.quote}</span>
                  {c.source && <span className="text-[var(--text-muted)]">（《{c.source}》）</span>}
                </div>
              ))}
              {citations.length > 2 && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setShowAll(!showAll); }}
                  aria-expanded={showAll}
                  className="text-[11px] text-[var(--text-accent)] hover:underline"
                >
                  {showAll ? "收起" : `展开全部 ${citations.length} 家注`}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  ) : null;

  return tooltip ? createPortal(tooltip, document.body) : null;
}
