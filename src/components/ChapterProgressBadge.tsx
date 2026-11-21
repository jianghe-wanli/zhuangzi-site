"use client";

import { useEffect } from "react";

import { getProgress } from "@/lib/reading-progress";

const BADGE_CLASS =
  "inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-[var(--text-accent)]/8 text-[var(--text-accent)] border border-[var(--text-accent)]/20";

/**
 * 篇章列表页的「已读进度」徽章 —— 全页一个客户端岛（此前每张卡片一个，共 33 个）。
 *
 * 列表正文是静态块（不由 React 管理子节点），这里在挂载后读 localStorage 的
 * 段落级进度（RecordReading 写入），给有记录的篇章在 [data-chapter-progress]
 * 元素之后插入徽章。没有任何进度记录时不加载 metadata，也不碰 DOM。
 */
export function ChapterProgressBadges() {
  useEffect(() => {
    const slots = Array.from(document.querySelectorAll<HTMLElement>("[data-chapter-progress]"));
    const read = slots.flatMap((slot) => {
      const chapterId = slot.dataset.chapterProgress ?? "";
      const pid = getProgress(chapterId)?.passageId;
      return pid ? [{ slot, chapterId, pid }] : [];
    });
    if (read.length === 0) return;
    let cancelled = false;
    const added: HTMLElement[] = [];
    void import("@/data/chapters/metadata").then(({ chaptersMeta, passageNumber }) => {
      if (cancelled) return;
      for (const { slot, chapterId, pid } of read) {
        const num = passageNumber(chapterId, pid);
        const total = chaptersMeta.find((c) => c.id === chapterId)?.passageCount ?? 0;
        if (!num || num < 1 || !slot.isConnected) continue;
        const badge = document.createElement("span");
        badge.className = BADGE_CLASS;
        badge.textContent = num >= total ? "已读完" : `读至第${num}节`;
        slot.after(badge);
        added.push(badge);
      }
    });
    return () => {
      cancelled = true;
      for (const el of added) el.remove();
    };
  }, []);
  return null;
}
