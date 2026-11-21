"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { ConcordanceWord } from "@/lib/concordance-data";

/** 出现位置编码基数，与 lib/concordance-data.ts 的 OCC_BASE 一致 */
const OCC_BASE = 100;

/**
 * 词语检索 + 展开（客户端岛）。
 * 词表由 server 页面压成数字编码后经 props 传入：首屏 HTML 直接带前 50 个词，
 * 不再等客户端挂载后动态 import 116KB 的 JSON（此前首屏只有「加载中…」）。
 */
export default function ConcordanceBrowser({
  words: allWords,
  chapters,
}: {
  words: ConcordanceWord[];
  chapters: { id: string; title: string }[];
}) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const words = useMemo(() => {
    const q = search.trim();
    if (!q) return allWords.slice(0, 50);
    return allWords.filter((w) => w.w.includes(q));
  }, [allWords, search]);

  return (
    <>
      {/* Search input */}
      <input
        type="search"
        aria-label="搜索词语"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="搜索词语…"
        className="w-full mb-8 px-4 py-3 text-sm rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--text-accent)]/20 focus:border-[var(--text-accent)]/40 transition-all shadow-sm"
      />

      <p className="sr-only" role="status">
        {search.trim() ? `找到 ${words.length} 个词` : ""}
      </p>
      {search.trim() && words.length === 0 && (
        <p className="text-center py-16 text-sm text-[var(--text-muted)]">
          索引中没有包含「{search.trim()}」的词
        </p>
      )}

      {/* Word list */}
      <div className="space-y-2">
        {words.map((w) => (
          <div
            key={w.w}
            className="card overflow-hidden"
          >
            <button
              type="button"
              aria-expanded={expanded === w.w}
              onClick={() => setExpanded(expanded === w.w ? null : w.w)}
              className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-[var(--hover-bg)] transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-[var(--text-primary)]">
                  {w.w}
                </span>
                <span className="text-xs text-[var(--text-muted)]">
                  {w.c} 次
                </span>
              </div>
              <svg
                aria-hidden="true"
                className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${
                  expanded === w.w ? "rotate-180" : ""
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 8.25l-7.5 7.5-7.5-7.5"
                />
              </svg>
            </button>
            {expanded === w.w && (
              <div className="px-5 pb-4 space-y-1 border-t border-[var(--border-light)] pt-3">
                {w.o.map((code) => {
                  const ci = Math.floor(code / OCC_BASE);
                  const n = code % OCC_BASE;
                  const ch = chapters[ci];
                  if (!ch) return null;
                  return (
                    <Link
                      key={code}
                      href={`/chapters/${ch.id}#passage-${ch.id}-${n}`}
                      className="flex items-center gap-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-accent)] py-1 transition-colors"
                    >
                      <span className="chapter-badge text-[10px] w-5 h-5" aria-hidden="true">
                        {ci + 1}
                      </span>
                      {ch.title}
                      <span className="text-[var(--text-muted)] text-[10px]">
                        · 第 {n} 节
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
