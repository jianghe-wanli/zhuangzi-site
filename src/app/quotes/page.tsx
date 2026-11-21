import type { Metadata } from "next";
import Link from "next/link";

import FilterableList from "@/components/FilterableList";
import quotesData from "@/data/quotes.json";
import { buildPageMetadata, canonicalUrl, SITE_NAME, SITE_URL } from "@/lib/site";

const TITLE = "名句精选";
const DESCRIPTION =
  "《庄子》名句精选，按逍遥、齐物、养生、处世、生死、真知等十类主题编排，每句附出处篇章与白话释义。";
const URL_PATH = "/quotes";

interface Quote {
  id: string;
  text: string;
  chapter: string;
  chapterId: string;
  passageId: string;
  theme: string;
  explanation: string;
  translation?: string;
  usage?: string;
}

const quotes = (quotesData as { quotes: Quote[] }).quotes;

const quotesJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "CollectionPage",
      "@id": `${canonicalUrl(URL_PATH)}#collection`,
      name: `${TITLE} — ${SITE_NAME}`,
      description: DESCRIPTION,
      inLanguage: "zh-Hans",
      url: canonicalUrl(URL_PATH),
      isPartOf: { "@id": `${SITE_URL}/#website` },
      mainEntity: {
        "@type": "ItemList",
        numberOfItems: quotes.length,
        itemListElement: quotes.map((q, i) => ({
          "@type": "ListItem",
          position: i + 1,
          item: {
            "@type": "Quotation",
            "@id": `${canonicalUrl(URL_PATH)}#${q.id}`,
            text: q.text,
            inLanguage: "zh-Hant",
            about: q.theme,
            description: q.explanation,
            spokenByCharacter: { "@type": "Person", name: "庄子" },
            isBasedOn: {
              "@type": "Chapter",
              "@id": `${canonicalUrl(`/chapters/${q.chapterId}`)}#chapter`,
              name: q.chapter,
              url: canonicalUrl(`/chapters/${q.chapterId}`),
            },
          },
        })),
      },
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "首页", item: canonicalUrl("/") },
        { "@type": "ListItem", position: 2, name: TITLE, item: canonicalUrl(URL_PATH) },
      ],
    },
  ],
};

const themes = [
  "逍遥自由", "认知局限", "生死观", "处世智慧",
  "无用之用", "自然无为", "齐物平等", "养生之道", "批判仁义",
];

const themeOptions = themes.map((t) => ({
  value: t,
  count: quotes.filter((q) => q.theme === t).length,
}));

export const metadata: Metadata = buildPageMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: URL_PATH,
});

export default function QuotesPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      {/* 名句用 Quotation 类型标注，并通过 isBasedOn 指回所属篇章 */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(quotesJsonLd) }}
      />
      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-[0.04em] text-[var(--text-primary)] mb-3">
          名句精选
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">
          按主题分类，品味庄子哲思
        </p>
        <div className="ink-divider" />
      </div>

      {/* 卡片 server 直出（每句带锚点：章节页原文的名句标记跳转目标）；主题筛选是唯一的客户端岛 */}
      <FilterableList
        options={themeOptions}
        total={quotes.length}
        countTemplate="共 {n} 句"
        groupLabel="按主题筛选名句"
        barClassName="flex flex-wrap justify-center gap-2 mb-10"
        buttonClassName="text-xs px-3 py-1.5 rounded-full transition-all"
        activeClassName="bg-[var(--text-accent)] text-[var(--btn-accent-text,#ffffff)] border-[var(--text-accent)] font-medium"
        inactiveClassName="tag text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        countClassName="text-center text-xs text-[var(--text-muted)] mb-8"
        listClassName="flex flex-col gap-4"
      >
        {quotes.map((q) => (
          <div
            key={q.id}
            id={q.id}
            data-keys={q.theme}
            className="card p-5 sm:p-6 hover:-translate-y-0.5 transition-transform scroll-mt-20"
          >
            <div className="flex items-center justify-between mb-3">
              <Link
                href={
                  q.passageId
                    ? `/chapters/${q.chapterId}#passage-${q.passageId}`
                    : `/chapters/${q.chapterId}`
                }
                className="text-xs font-medium text-[var(--text-accent)] tracking-[0.06em] inline-block hover:text-[var(--color-accent-deep)] transition-colors"
              >
                {q.chapter}
              </Link>
              <span className="tag">{q.theme}</span>
            </div>
            <blockquote className="text-sm sm:text-base text-[var(--text-primary)] leading-[1.9] tracking-wide font-serif mb-4">
              &ldquo;{q.text}&rdquo;
            </blockquote>
            {q.translation && (
              <p className="text-sm text-[var(--text-secondary)] leading-[1.9] pl-3 border-l-2 border-[var(--border-light)] mb-3">
                {q.translation}
              </p>
            )}
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-3">
              <span className="font-medium text-[var(--text-accent)]">解读</span>　{q.explanation}
            </p>
            {q.usage && (
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                <span className="font-medium text-[var(--text-accent)]">今日适用</span>　{q.usage}
              </p>
            )}
          </div>
        ))}
      </FilterableList>
    </div>
  );
}
