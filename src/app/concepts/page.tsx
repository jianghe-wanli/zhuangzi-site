import type { Metadata } from "next";

import StaticBlock from "@/components/StaticBlock";
import ThoughtMapWrapper from "@/components/ThoughtMapWrapper";
import { concepts } from "@/data/concepts";
import { buildPageMetadata, canonicalUrl, SITE_URL } from "@/lib/site";
import { jsonLdString, registerStaticBlocks, staticBlocksRev } from "@/lib/static-html";

import { CONCEPT_LIST_SRC as SRC, conceptListBlocks } from "./list-blocks";

export const metadata: Metadata = buildPageMetadata({
  title: "核心概念",
  description:
    "《庄子》核心哲学概念图谱 — 道、逍遥、齐物、无待、心斋、坐忘、真人、物化等范畴的释义、出处段落与概念间关联。",
  path: "/concepts",
});

/**
 * 术语集（词汇表）结构化数据。
 * 概念详情页各自声明 DefinedTerm 并 inDefinedTermSet 指向本页的 @id，
 * 这里补上术语集本体与成员列表，形成完整的 glossary 结构。
 */
const glossaryJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "DefinedTermSet",
      "@id": `${SITE_URL}/concepts/#termset`,
      name: "庄子核心概念",
      description:
        "《庄子》哲学的核心范畴与术语，含释义、原文出处与概念关联。",
      inLanguage: "zh-Hans",
      url: canonicalUrl("/concepts"),
      hasDefinedTerm: concepts.map((c) => ({
        "@type": "DefinedTerm",
        "@id": `${canonicalUrl(`/concepts/${c.id}`)}#term`,
        name: c.name,
        description: c.summary,
        url: canonicalUrl(`/concepts/${c.id}`),
      })),
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "首页", item: canonicalUrl("/") },
        { "@type": "ListItem", position: 2, name: "核心概念", item: canonicalUrl("/concepts") },
      ],
    },
  ],
};

export default function ConceptsPage() {
  registerStaticBlocks(SRC, { ...conceptListBlocks(), ld: jsonLdString(glossaryJsonLd) });
  const rev = staticBlocksRev(SRC);
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      <StaticBlock src={SRC} rev={rev} id="ld" as="script" type="application/ld+json" ssrOnly />
      <StaticBlock src={SRC} rev={rev} id="head" />
      <section className="mb-16">
        <StaticBlock src={SRC} rev={rev} id="maphead" />
        <ThoughtMapWrapper />
      </section>
      <StaticBlock src={SRC} rev={rev} id="grid" />
    </div>
  );
}
