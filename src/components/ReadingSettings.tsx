"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";

import { JIAZHU_MODE_KEY, readingCssValue, readReadingPrefs } from "@/lib/reading-prefs";

// 面板（约 8KB 源码 + 设置逻辑）只在读者首次点开时下载，不进共享 JS
const loadPanel = () => import("./ReadingSettingsPanel");
const ReadingSettingsPanel = dynamic(loadPanel, { ssr: false, loading: () => null });

export default function ReadingSettings() {
  const [open, setOpen] = useState(false);
  // 首次打开后保持挂载：面板内的音效引擎与选择状态要跨开合保留
  const [activated, setActivated] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  // 排版偏好已由 <head> 内联脚本在首帧前写好（见 @/lib/reading-prefs）；
  // 这里再应用一次只为兜住内联脚本被拦截（严格 CSP / 扩展）的情况。
  useEffect(() => {
    for (const [k, v] of Object.entries(readReadingPrefs())) {
      document.documentElement.style.setProperty(`--reading-${k}`, readingCssValue(k, v)!);
    }
    try {
      if (localStorage.getItem(JIAZHU_MODE_KEY) === "jiazhu") {
        document.documentElement.classList.add("jiazhu-mode");
      }
    } catch {}
  }, []);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setActivated(true);
          setOpen(!open);
        }}
        // 悬停 / 聚焦即预取面板 chunk，点击时基本已就绪
        onPointerEnter={() => void loadPanel()}
        onFocus={() => void loadPanel()}
        className="min-w-[32px] min-h-[32px] flex items-center justify-center p-1.5 rounded hover:bg-[var(--hover-bg)] text-[var(--text-secondary)] hover:text-[var(--text-accent)] transition-colors"
        title="阅读设置"
        aria-label="阅读设置"
        aria-expanded={open}
      >
        <svg className="w-3.5 h-3.5" fill="none" aria-hidden="true" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
        </svg>
      </button>

      {activated && <ReadingSettingsPanel open={open} onClose={close} />}
    </div>
  );
}
