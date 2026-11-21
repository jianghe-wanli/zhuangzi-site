"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

// 面板本体只在首次按下 ？ 时下载；常驻的只有下面这个按键监听
const ShortcutsHelpPanel = dynamic(() => import("./ShortcutsHelpPanel"), {
  ssr: false,
  loading: () => null,
});

/**
 * 快捷键帮助面板（按 ？ 唤出，GitHub/Gmail 式）。
 *
 * 站内已有 ⌘K、←/→、b、m、/ 等快捷键，但没有任何地方列出 —— 用户
 * 无从得知。本组件是挂在根布局的叶子客户端岛（不包裹任何正文，
 * 见 TODO「正文不得进入 client 祖先」约束）。
 */
export default function ShortcutsHelp() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable;
      // 无修饰键的 ？ 切换面板；输入状态下不触发
      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey && !typing) {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return open ? <ShortcutsHelpPanel onClose={() => setOpen(false)} /> : null;
}
