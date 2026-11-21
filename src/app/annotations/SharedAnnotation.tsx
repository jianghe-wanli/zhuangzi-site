"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";

import { passageNumberFromId as passageNumber } from "@/lib/passage-number";

import SharedAnnotationEmpty from "./SharedAnnotationEmpty";

export default function SharedAnnotation({ chapterTitles }: { chapterTitles: Record<string, string> }) {
  const searchParams = useSearchParams();
  const ch = searchParams.get("ch");
  const p = searchParams.get("p");
  const a = searchParams.get("a");

  const annotation = useMemo(() => {
    // 只接受站内真实存在的篇章，避免用参数拼出指向任意路径的链接
    if (ch && p && a && chapterTitles[ch]) {
      // URLSearchParams.get() 已自动解码，这里不能再 decode（含 % 的文本会抛 URIError）
      return { chapterId: ch, passageId: p, text: a };
    }
    return null;
  }, [ch, p, a, chapterTitles]);

  if (!annotation) return <SharedAnnotationEmpty />;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      <Link
        href="/"
        className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-accent)] transition-colors"
      >
        ← 首页
      </Link>

      <h1 className="text-3xl font-bold tracking-wide mt-4 mb-2">共享批注</h1>
      <p className="text-sm text-[var(--text-secondary)] mb-8">
        他人分享的段落批注
      </p>

      <div className="p-6 rounded-lg border border-[var(--border-light)] bg-[var(--bg-card)]">
        <div className="text-xs text-[var(--text-secondary)] mb-3">
          <Link
            href={`/chapters/${annotation.chapterId}`}
            className="text-[var(--text-accent)] hover:underline"
          >
            {chapterTitles[annotation.chapterId]}
          </Link>
          {" · "}第 {passageNumber(annotation.chapterId, annotation.passageId) ?? annotation.passageId} 节
        </div>
        <div className="text-sm text-[var(--text-primary)] leading-relaxed bg-[var(--bg-secondary)] rounded p-4">
          {annotation.text}
        </div>
        <Link
          href={`/chapters/${annotation.chapterId}#passage-${encodeURIComponent(annotation.passageId)}`}
          className="inline-block mt-4 text-xs text-[var(--text-accent)] hover:underline"
        >
          查看原文 →
        </Link>
      </div>
    </div>
  );
}
