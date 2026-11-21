"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import SearchBar from "@/components/SearchBar";
import { search, type SearchResult } from "@/lib/search";

export default function SearchResults() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!initialQuery) return;
    // 连续改词时只采纳最后一次查询的结果
    let cancelled = false;
    // URL 参数触发数据加载，先置 loading（挂载后执行）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    search(initialQuery)
      .then((r) => {
        if (cancelled) return;
        setResults(r);
        setSearched(true);
        // 结果已就位，撤掉首屏占位高度（结果不足一屏时页脚回到原位）
        delete document.documentElement.dataset.searching;
      })
      .catch((e) => {
        if (cancelled) return;
        console.error("[Search]", e);
        setError("搜索索引加载失败，请刷新重试");
        delete document.documentElement.dataset.searching;
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initialQuery]);

  // 离开搜索页时清掉占位标记
  useEffect(() => () => {
    delete document.documentElement.dataset.searching;
  }, []);

  // Extract snippet around the matched keyword
  const getSnippet = (text: string, q: string, maxLen = 120) => {
    if (!q.trim()) return text.slice(0, maxLen);
    const idx = text.indexOf(q);
    if (idx === -1) return text.slice(0, maxLen);
    const half = Math.floor(maxLen / 2);
    const start = Math.max(0, idx - half);
    const end = Math.min(text.length, idx + q.length + half);
    let snippet = text.slice(start, end);
    if (start > 0) snippet = "…" + snippet;
    if (end < text.length) snippet = snippet + "…";
    return snippet;
  };

  const highlightMatch = (text: string, q: string) => {
    if (!q.trim()) return text;
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(${escaped})`, "i");
    const parts = text.split(regex);
    // split 带捕获组时，匹配项必落在奇数下标，直接 i % 2 === 1 判断，
    // 规避全局正则 test() 的 lastIndex 陷阱（视觉复审 N3）
    return parts.map((part, i) =>
      i % 2 === 1 ? (
        <mark
          key={i}
          className="bg-[var(--text-accent)]/15 text-[var(--text-accent)] rounded px-0.5"
        >
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  const getFieldLabel = (field: string) => {
    switch (field) {
      case "original": return "原文";
      case "translation": return "译文";
      case "commentary": return "解读";
      default: return "";
    }
  };

  return (
    <>
      <div className="mb-8 flex justify-center">
        <SearchBar compact initialValue={initialQuery} />
      </div>

      {loading && (
        <div className="mb-6 text-center text-sm text-[var(--text-secondary)]" role="status">
          正在加载搜索索引…
        </div>
      )}

      {error && (
        <div className="mb-6 text-center text-sm text-[var(--color-danger)]" role="alert">
          {error}
        </div>
      )}

      {searched && !error && (
        <div className="mb-6 text-center" role="status" aria-live="polite">
          <p className="text-sm text-[var(--text-secondary)]">
            {results.length === 0
              ? `未找到与「${initialQuery}」相关的内容`
              : `找到 ${results.length} 条与「${initialQuery}」相关的结果`}
          </p>
        </div>
      )}

      <div className="space-y-4">
        {results.map((result, idx) => (
          <Link
            key={`${result.chapterId}-${result.passageId}-${idx}`}
            href={`/chapters/${result.chapterId}#passage-${result.passageId}`}
            className="card-interactive group block p-5"
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-semibold text-[var(--text-accent)] tracking-wide">
                {result.chapterTitle}
              </span>
              <span className="tag">
                {getFieldLabel(result.matchField)}
              </span>
            </div>
            <p className="text-sm text-[var(--text-primary)] leading-[1.9] tracking-wide font-serif mb-2">
              {highlightMatch(getSnippet(result.original, initialQuery), initialQuery)}
            </p>
            {/* 译文只作对照展示，不高亮 —— 搜索只匹配原文，
                译文里恰有同词并不代表该段因译文命中 */}
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed line-clamp-2">
              {result.translation}
            </p>
          </Link>
        ))}
      </div>
    </>
  );
}
