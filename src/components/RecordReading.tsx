"use client";

import { useCallback,useEffect, useRef } from "react";

import { subscribeCurrentPassage } from "@/lib/passage-dom";
import { restoreProgress,saveProgress } from "@/lib/reading-progress";

import { recordReading } from "./ReadingHistory";

interface Props {
  chapterId: string;
  chapterTitle: string;
}

/**
 * 阅读进度记录（章节级历史 + 段落级续读）。
 *
 * 像素级滚动恢复一直存在，但 restoreProgress 的「段落锚点优先」分支
 * 从未生效 —— 旧实现的 currentPassageId 是可选 prop，而章节页从不传，
 * saveProgress 存进去的 passageId 恒为空串。现在订阅 passage-dom 的共用
 * IntersectionObserver 跟踪当前可见段落（与 ChapterTOC 的 scroll spy 是同一个），
 * 无需页面传 prop；刷新/重进页面时恢复到段落锚点而非像素位置。
 */
export default function RecordReading({ chapterId, chapterTitle }: Props) {
  const restored = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const passageRef = useRef("");

  // 跟踪当前视口内的段落 id（写入 passageRef 供滚动保存使用；与目录共用同一个观察器）
  useEffect(
    () =>
      subscribeCurrentPassage((el) => {
        passageRef.current = el.id.replace(/^passage-/, "");
      }),
    []
  );

  // Restore scroll position on first mount
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;

    recordReading(chapterId, chapterTitle);

    // 地址带 #passage-… 锚点（搜索结果、名句、复制的段落链接）时锚点优先，不恢复上次进度。
    // 浏览器的原生锚点滚动发生在 content-visibility:auto 的段落按估算高度占位时，
    // 前面的段落渲染出真实高度后目标会被推走（实测齐物论第 6 节偏出 3000px）——
    // 布局稳定后重新对齐，连做两帧。
    let target: HTMLElement | null = null;
    if (window.location.hash) {
      try {
        target = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
      } catch {
        /* 非法 hash：忽略 */
      }
    }
    let raf2 = 0;
    const raf = requestAnimationFrame(() => {
      if (!window.location.hash) {
        restoreProgress(chapterId);
        return;
      }
      target?.scrollIntoView({ behavior: "instant", block: "start" });
      raf2 = requestAnimationFrame(() => target?.scrollIntoView({ behavior: "instant", block: "start" }));
    });
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(raf2);
    };
  }, [chapterId, chapterTitle]);

  // Save progress on scroll (debounced)
  const handleScroll = useCallback(() => {
    if (timerRef.current !== undefined) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      saveProgress(chapterId, chapterTitle, passageRef.current);
    }, 2000);
  }, [chapterId, chapterTitle]);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (timerRef.current !== undefined) clearTimeout(timerRef.current);
    };
  }, [handleScroll]);

  // Also save on unmount (tab close / navigation)
  useEffect(() => {
    return () => {
      saveProgress(chapterId, chapterTitle, passageRef.current);
    };
  }, [chapterId, chapterTitle]);

  return null;
}
