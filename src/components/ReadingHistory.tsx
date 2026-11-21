"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface HistoryItem {
  chapterId: string;
  chapterTitle: string;
  timestamp: number;
  progress: number;
}

const STORAGE_KEY = "reading_history";
const MAX_ITEMS = 10;

/** 读取并校验：存储被手动改坏 / 旧版本格式时返回空数组而不是让调用方崩溃 */
export function getReadingHistory(): HistoryItem[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (h): h is HistoryItem =>
        !!h && typeof h.chapterId === "string" && typeof h.chapterTitle === "string"
    );
  } catch {
    return [];
  }
}

export function recordReading(chapterId: string, chapterTitle: string) {
  try {
    const filtered = getReadingHistory().filter((h) => h.chapterId !== chapterId);
    filtered.unshift({
      chapterId,
      chapterTitle,
      timestamp: Date.now(),
      progress: 100,
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered.slice(0, MAX_ITEMS)));
    window.dispatchEvent(new Event("reading-recorded"));
  } catch {}
}

export default function ReadingHistoryWidget() {
  const [history, setHistory] = useState<HistoryItem[]>([]);

  useEffect(() => {
    const initial = getReadingHistory();
    if (initial.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHistory(initial);
    }
    const handler = () => setHistory(getReadingHistory());
    window.addEventListener("reading-recorded", handler);
    return () => window.removeEventListener("reading-recorded", handler);
  }, []);

  if (history.length === 0) return null;

  return (
    <section className="px-4 sm:px-6 lg:px-8 mb-20">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[var(--text-accent)] tracking-[0.08em]">
            最近阅读
          </h3>
          <button
            type="button"
            onClick={() => {
              try {
                localStorage.removeItem(STORAGE_KEY);
              } catch {}
              setHistory([]);
            }}
            className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            清除记录
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {history.slice(0, 6).map((item) => (
            <Link
              key={`${item.chapterId}-${item.timestamp}`}
              href={`/chapters/${item.chapterId}`}
              prefetch={false}
              className="tag hover:border-[var(--text-accent)] hover:text-[var(--text-accent)] hover:bg-[var(--hover-bg)] transition-all cursor-pointer py-1.5 px-3 text-xs"
            >
              {item.chapterTitle}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
