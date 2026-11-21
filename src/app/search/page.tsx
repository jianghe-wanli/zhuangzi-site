import type { Metadata } from "next";
import { Suspense } from "react";

import { buildPageMetadata } from "@/lib/site";

import SearchResults from "./SearchResults";

export const metadata: Metadata = buildPageMetadata({
  title: "全文搜索",
  description:
    "检索《庄子》三十三篇的原文、白话翻译与历代注疏，支持模糊匹配与按内篇/外篇/杂篇、核心概念筛选。",
  path: "/search",
  index: false,
});

export default function SearchPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      <div className="text-center mb-10">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-[0.04em] text-[var(--text-primary)] mb-3">
          全文搜索
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">
          搜索原文、译文与解读
        </p>
        <div className="ink-divider" />
      </div>

      {/* useSearchParams 需要 Suspense 边界；标题区由 server 直出，不随之退化成 fallback */}
      <Suspense
        fallback={
          <p className="py-12 text-center text-sm text-[var(--text-muted)] animate-pulse">正在加载搜索…</p>
        }
      >
        <SearchResults />
      </Suspense>
    </div>
  );
}
