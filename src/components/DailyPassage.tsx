"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export interface DailySnippet {
  chapterId: string;
  chapterTitle: string;
  passageNum: number;
  original: string;
}

/** 译文按需加载的地址（src/app/daily-translations.json/route.ts 构建期生成） */
const TRANSLATIONS_URL = "/daily-translations.json";

// 模块级缓存：同一会话内只取一次（悬停预热与点击共用同一个 Promise）
let translationsPromise: Promise<string[]> | null = null;

function loadTranslations(): Promise<string[]> {
  translationsPromise ??= fetch(TRANSLATIONS_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<string[]>;
    })
    .catch((err) => {
      translationsPromise = null; // 失败不缓存，允许重试
      throw err;
    });
  return translationsPromise;
}

function todaySeed(now: Date): number {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const today = `${y}-${m}-${d}`;
  let seed = 0;
  for (let i = 0; i < today.length; i++) {
    seed = ((seed << 5) - seed) + today.charCodeAt(i);
    seed = seed & seed;
  }
  return Math.abs(seed);
}

export default function DailyPassage({ pool }: { pool: DailySnippet[] }) {
  const [idx, setIdx] = useState(0);
  const [dateLabel, setDateLabel] = useState("");
  const [showTranslation, setShowTranslation] = useState(false);
  const [translations, setTranslations] = useState<string[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  // 悬停 / 聚焦 / 触摸即预热，点击时译文通常已就绪
  const prewarm = () => {
    loadTranslations().then(setTranslations, () => {});
  };

  const toggleTranslation = () => {
    const next = !showTranslation;
    setShowTranslation(next);
    if (next && !translations) {
      setLoadFailed(false);
      loadTranslations().then(setTranslations, () => setLoadFailed(true));
    }
  };

  useEffect(() => {
    if (pool.length === 0) return;
    // 水合后下一帧即切入当日段落，拆分长任务的同时避免晚更新重置 LCP，
    // 并以纯算术拼接替代 toLocaleDateString 规避首屏冷加载 ICU 本地化表开销
    const raf = window.requestAnimationFrame(() => {
      const now = new Date();
      setIdx(todaySeed(now) % pool.length);
      setDateLabel(`${now.getMonth() + 1}月${now.getDate()}日`);
    });
    return () => window.cancelAnimationFrame(raf);
  }, [pool.length]);

  const daily = pool[idx] ?? pool[0];
  if (!daily) return null;

  const pNum = daily.passageNum;

  return (
    <section className="px-4 sm:px-6 lg:px-8 mb-20">
      <div className="max-w-2xl mx-auto">
        <div className="daily-passage-book">
          {/* 缎带书签 */}
          <span className="ribbon-bookmark" aria-hidden="true">
            每日一庄
          </span>

          {/* 移动端精致横向线装书签头（篇名 + 节号 + 日期 + 装饰虚线分割） */}
          <div className="sm:hidden flex items-center justify-between pb-3 mb-4 border-b border-dashed border-[var(--border-color)]">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[var(--text-accent)] tracking-[0.12em]">
                {daily.chapterTitle}
              </span>
              {pNum > 0 && (
                <span className="text-[11px] px-1.5 py-0.5 rounded bg-[var(--hover-bg)] text-[var(--text-muted)] font-serif">
                  第{pNum}节
                </span>
              )}
            </div>
            <span className="text-[11px] text-[var(--text-muted)]">
              {dateLabel}
            </span>
          </div>

          {/* 桌面端页眉：篇名 + 日期 */}
          <div className="hidden sm:flex items-center justify-between mb-5">
            <span className="text-xs font-semibold text-[var(--text-accent)] tracking-[0.12em]">
              {daily.chapterTitle}{pNum > 0 ? ` · 第${pNum}节` : ""}
            </span>
            <span className="text-[11px] text-[var(--text-muted)]">
              {dateLabel}
            </span>
          </div>

          {/* 书页主体：移动端纵向全宽，桌面端左竖排古典提字 + 右展开正文 */}
          <div className="flex flex-col sm:flex-row gap-4 sm:gap-7">
            {/* 桌面端左竖排古典提字 */}
            <div className="hidden sm:block vertical-extract flex-none" aria-hidden="true">
              <p className="font-serif">
                {(() => {
                  const n = Math.min(24, Math.floor(daily.original.length / 4) * 4);
                  return daily.original.slice(0, n) + (daily.original.length > n ? "…" : "");
                })()}
              </p>
            </div>

            <div className="flex-1 min-w-0">
              <blockquote className="text-sm sm:text-base text-[var(--text-primary)] leading-[1.9] tracking-wide font-serif">
                &ldquo;{daily.original}&rdquo;
              </blockquote>

              {showTranslation && (
                <div
                  id="daily-translation"
                  aria-live="polite"
                  className="mt-4 p-3.5 sm:p-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-light)]"
                >
                  <p className="text-xs sm:text-sm text-[var(--text-secondary)] italic leading-relaxed">
                    {translations?.[idx] ?? (loadFailed ? "译文加载失败，请检查网络后重试。" : "译文载入中…")}
                  </p>
                </div>
              )}

              {/* 底部操作栏：响应式换行排布 */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={toggleTranslation}
                  onPointerEnter={prewarm}
                  onFocus={prewarm}
                  onTouchStart={prewarm}
                  aria-expanded={showTranslation}
                  aria-controls="daily-translation"
                  className="text-xs font-medium text-[var(--text-accent)] hover:text-[var(--color-accent-deep)] transition-colors"
                >
                  {showTranslation ? "收起译文" : "查看白话译文"}
                </button>
                <Link
                  href={`/chapters/${daily.chapterId}`}
                  prefetch={false}
                  className="text-xs text-[var(--text-muted)] hover:text-[var(--text-accent)] transition-colors flex items-center gap-1 shrink-0"
                >
                  <span>{daily.chapterTitle}{pNum > 0 ? ` · 第${pNum}节` : ""} · 阅读全文</span>
                  <svg className="w-3 h-3" fill="none" aria-hidden="true" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
