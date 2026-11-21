import type { Metadata } from "next";

import quotesData from "@/data/quotes.json";
import { breadcrumbJsonLd } from "@/lib/breadcrumb-jsonld";
import { buildPageMetadata } from "@/lib/site";

import ReciteGame, { type Quote } from "./ReciteGame";

export const metadata: Metadata = buildPageMetadata({
  title: "名句背诵",
  description:
    "《庄子》名句挖空背诵练习 — 四十四句传世名句随机挖空填字，逐字批改正误，配合拼音与译文巩固记忆。",
  path: "/recite",
});

// 只把背诵用到的字段传给客户端岛
const quotes: Quote[] = quotesData.quotes.map((q) => ({
  id: q.id,
  text: q.text,
  chapter: q.chapter,
  chapterId: q.chapterId,
  theme: q.theme,
  explanation: q.explanation,
  translation: q.translation,
}));

export default function RecitePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: breadcrumbJsonLd("名句背诵", "/recite") }}
      />
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="flex items-center gap-2 mb-2">
          <span className="seal-char-lg" aria-hidden="true">誦</span>
          <h1 className="text-2xl sm:text-3xl font-serif font-bold tracking-wide">
            名句背诵
          </h1>
        </div>
        <p className="text-sm text-[var(--text-secondary)] mb-6">
          宋刻活字点选，挖空填字，把千古名句刻进心坎
        </p>
        <ReciteGame quotes={quotes} />
      </div>
    </>
  );
}
