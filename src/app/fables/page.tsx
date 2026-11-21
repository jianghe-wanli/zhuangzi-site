import type { Metadata } from "next";
import Link from "next/link";

import FilterableList from "@/components/FilterableList";
import fablesData from "@/data/fables.json";
import { buildPageMetadata, canonicalUrl, SITE_NAME, SITE_URL } from "@/lib/site";

const TITLE = "寓言故事";
const DESCRIPTION =
  "庄子寓言故事集 — 鲲鹏、庖丁解牛、庄周梦蝶、井底之蛙、濠梁之辩、鼓盆而歌等经典寓言的原文、译文与寓意解读。";
const URL_PATH = "/fables";

export const metadata: Metadata = buildPageMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: URL_PATH,
});

interface Fable {
  id: string;
  name: string;
  chapter: string;
  chapterId: string;
  passageId: string;
  summary: string;
  moral: string;
  keywords: string[];
}

const fables = (fablesData as { fables: Fable[] }).fables;

const keywordOptions = Array.from(new Set(fables.flatMap((f) => f.keywords)))
  .sort()
  .map((k) => ({ value: k, count: fables.filter((f) => f.keywords.includes(k)).length }));

const fableHref = (f: Fable) =>
  f.passageId ? `/chapters/${f.chapterId}#passage-${f.passageId}` : `/chapters/${f.chapterId}`;

const jsonLd = {
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
        numberOfItems: fables.length,
        itemListElement: fables.map((f, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: f.name,
          url: canonicalUrl(`/chapters/${f.chapterId}`),
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

export default function FablesPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-[0.04em] text-[var(--text-primary)] mb-3">
          寓言索引
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">
          庄子寓言，汪洋恣肆，天马行空
        </p>
        <div className="ink-divider" />
      </div>

      {/* 卡片 server 直出；筛选按钮是唯一的客户端岛 */}
      <FilterableList
        options={keywordOptions}
        total={fables.length}
        countTemplate="共 {total} 则寓言 · 筛选 {n} 则"
        groupLabel="按关键词筛选寓言"
        barClassName="flex flex-wrap justify-center gap-2 mb-8"
        buttonClassName="text-xs px-3 py-1.5 rounded-full transition-all"
        activeClassName="bg-[var(--text-accent)] text-[var(--btn-accent-text,#ffffff)] font-medium"
        inactiveClassName="tag text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        countClassName="text-center text-xs text-[var(--text-muted)] mb-8"
        listClassName="grid sm:grid-cols-2 gap-4"
      >
        {fables.map((f) => (
          <Link
            key={f.id}
            href={fableHref(f)}
            data-keys={f.keywords.join(" ")}
            className="card-interactive group p-5 flex flex-col gap-3"
          >
            <h2 className="text-base font-semibold text-[var(--text-accent)] tracking-wide group-hover:text-[var(--color-accent-deep)] transition-colors">
              {f.name}
            </h2>
            <p className="text-xs text-[var(--text-primary)] leading-relaxed flex-1">
              {f.summary}
            </p>
            <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)] pt-1">
              <span>{f.chapter}</span>
              <span className="opacity-30" aria-hidden="true">·</span>
              <span className="italic">{f.moral}</span>
            </div>
          </Link>
        ))}
      </FilterableList>
    </div>
  );
}
