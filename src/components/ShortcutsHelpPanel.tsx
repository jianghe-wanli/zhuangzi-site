"use client";

import { useEffect, useRef } from "react";

const SHORTCUTS: { keys: string; desc: string; scope: string }[] = [
  { keys: "⌘K / Ctrl+K", desc: "打开命令台（搜索 / 跳转 / 指令）", scope: "全站" },
  { keys: "？", desc: "打开本帮助面板", scope: "全站" },
  { keys: "Esc", desc: "关闭弹层 / 下拉菜单", scope: "全站" },
  { keys: "← / →", desc: "上一篇 / 下一篇", scope: "章节页" },
  { keys: "/", desc: "聚焦页内搜索框", scope: "章节页" },
  { keys: "b", desc: "收藏当前段落", scope: "章节页" },
  { keys: "m", desc: "切换竖排 / 横排", scope: "章节页" },
];

/** 快捷键帮助面板本体：由 ShortcutsHelp 在首次按下 ？ 时动态加载 */
export default function ShortcutsHelpPanel({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  // 模态对话框的焦点管理：打开时焦点移入，关闭时还给之前的元素。
  // 面板内只有「关闭」一个可聚焦控件，Tab 原地循环即构成焦点陷阱。
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4 no-print"
      role="dialog"
      onKeyDown={(e) => {
        if (e.key === "Tab") {
          e.preventDefault();
          closeRef.current?.focus();
        }
      }}
      aria-modal="true"
      aria-labelledby="shortcuts-help-title"
    >
      {/* 遮罩 */}
      <button
        type="button"
        aria-label="关闭快捷键帮助"
        onClick={() => onClose()}
        className="absolute inset-0 bg-black/30 backdrop-blur-[2px] cursor-default"
        tabIndex={-1}
      />
      <div className="relative w-full max-w-sm rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-xl p-6 animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <h2 id="shortcuts-help-title" className="text-base font-semibold text-[var(--text-accent)] tracking-[0.06em]">
            键盘快捷键
          </h2>
          <button
            type="button"
            ref={closeRef}
            onClick={() => onClose()}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)] transition-colors"
            aria-label="关闭"
          >
            <svg className="w-4 h-4" fill="none" aria-hidden="true" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <dl className="space-y-2.5">
          {SHORTCUTS.map((s) => (
            <div key={s.keys} className="flex items-center justify-between gap-4">
              <dt className="flex items-center gap-2">
                <kbd className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] whitespace-nowrap">
                  {s.keys}
                </kbd>
              </dt>
              <dd className="text-right">
                <span className="block text-sm text-[var(--text-primary)] leading-tight">{s.desc}</span>
                <span className="block text-xs text-[var(--text-muted)]">{s.scope}</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
