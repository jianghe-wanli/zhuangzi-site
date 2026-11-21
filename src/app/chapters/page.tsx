import type { Metadata } from "next";

import { ChapterProgressBadges } from "@/components/ChapterProgressBadge";
import StaticBlock from "@/components/StaticBlock";
import { chaptersMeta } from "@/data/chapters/metadata";
import { buildPageMetadata, canonicalUrl, SITE_URL } from "@/lib/site";
import { jsonLdString, registerStaticBlocks, staticBlocksRev } from "@/lib/static-html";

import { CHAPTER_LIST_SRC as SRC, chapterListBlocks } from "./list-blocks";

export const metadata: Metadata = buildPageMetadata({
  title: "篇章",
  description:
    "《庄子》三十三篇总览 — 内篇七篇、外篇十五篇、杂篇十一篇，逐篇附题解、段落数与核心概念，可直接进入全文与注疏。",
  path: "/chapters",
});

/**
 * 整书结构化数据。
 *
 * 根布局只声明了 Book 实体本身（@id = #book），没有列出组成部分；
 * 搜索引擎因此无法把 33 个章节页理解为同一部书的篇目。
 * hasPart 放在本页（书的自然主页）而不是根布局 —— 否则 33 条 Chapter
 * 会被塞进全部 83 个页面的 JSON-LD，白白增加每页体积。
 */
const bookJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Book",
      "@id": `${SITE_URL}/#book`,
      name: "庄子",
      alternateName: ["南华真经", "莊子"],
      inLanguage: "zh-Hant",
      numberOfPages: chaptersMeta.length,
      url: canonicalUrl("/chapters"),
      author: {
        "@type": "Person",
        name: "庄周",
        alternateName: "庄子",
        sameAs: "https://www.wikidata.org/wiki/Q4700",
      },
      hasPart: chaptersMeta.map((ch) => ({
        "@type": "Chapter",
        "@id": `${canonicalUrl(`/chapters/${ch.id}`)}#chapter`,
        name: ch.title,
        position: ch.order,
        description: ch.summary,
        isPartOf: { "@id": `${SITE_URL}/#book` },
        url: canonicalUrl(`/chapters/${ch.id}`),
      })),
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "首页", item: canonicalUrl("/") },
        { "@type": "ListItem", position: 2, name: "篇章", item: canonicalUrl("/chapters") },
      ],
    },
  ],
};

export default function ChaptersPage() {
  registerStaticBlocks(SRC, { ...chapterListBlocks(), ld: jsonLdString(bookJsonLd) });
  const rev = staticBlocksRev(SRC);
  return (
    <>
      <StaticBlock src={SRC} rev={rev} id="ld" as="script" type="application/ld+json" ssrOnly />
      <StaticBlock src={SRC} rev={rev} id="body" className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16" />
      <ChapterProgressBadges />
    </>
  );
}
