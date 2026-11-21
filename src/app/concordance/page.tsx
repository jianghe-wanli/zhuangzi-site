import type { Metadata } from "next";

import { chaptersMeta } from "@/data/chapters/metadata";
import { breadcrumbJsonLd } from "@/lib/breadcrumb-jsonld";
import { concordanceWords } from "@/lib/concordance-data";
import { buildPageMetadata } from "@/lib/site";

import ConcordanceBrowser from "./ConcordanceBrowser";

export const metadata: Metadata = buildPageMetadata({
  title: "词语索引",
  description:
    "《庄子》全文词语索引（concordance），按字词检索其在三十三篇中的全部用例与上下文，供文本细读与训诂考证使用。",
  path: "/concordance",
});

const chapters = chaptersMeta.map((m) => ({ id: m.id, title: m.title }));

export default function ConcordancePage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: breadcrumbJsonLd("词语索引", "/concordance") }}
      />
      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-[0.04em] text-[var(--text-primary)] mb-3">
          词语索引
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">
          {concordanceWords.length} 个词 · 全文检索分布
        </p>
        <div className="ink-divider" />
      </div>
      <ConcordanceBrowser words={concordanceWords} chapters={chapters} />
    </div>
  );
}
