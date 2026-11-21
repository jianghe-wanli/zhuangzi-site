import type { Metadata } from "next";
import Link from "next/link";

import routesData from "@/data/reading-routes.json";
import { chapterTitles } from "@/lib/chapter-lookup";
import { buildPageMetadata, canonicalUrl, SITE_NAME, SITE_URL } from "@/lib/site";

interface Route {
  id: string;
  title: string;
  description: string;
  chapters: string[];
  color: string;
}

export const metadata: Metadata = buildPageMetadata({
  title: "主题阅读路线",
  description:
    "按主题串联的《庄子》引导式阅读路线 — 从逍遥自由、齐物相对、养生处世到生死超越，为不同关切提供成体系的篇章次第。",
  path: "/reading-routes",
});

const routes = (routesData as { routes: Route[] }).routes;

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "CollectionPage",
      "@id": `${canonicalUrl("/reading-routes")}#collection`,
      name: `主题阅读路线 — ${SITE_NAME}`,
      inLanguage: "zh-Hans",
      url: canonicalUrl("/reading-routes"),
      isPartOf: { "@id": `${SITE_URL}/#website` },
      mainEntity: {
        "@type": "ItemList",
        numberOfItems: routes.length,
        itemListElement: routes.map((r, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: r.title,
          description: r.description,
        })),
      },
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "首页", item: canonicalUrl("/") },
        { "@type": "ListItem", position: 2, name: "主题阅读路线", item: canonicalUrl("/reading-routes") },
      ],
    },
  ],
};

export default function ReadingRoutesPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Header */}
      <div className="text-center mb-14">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-[0.04em] text-[var(--text-primary)] mb-3">
          主题式阅读
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">
          按主题串联篇章，系统理解庄子思想
        </p>
        <div className="ink-divider" />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {routes.map((r) => (
          <div
            key={r.id}
            className="card p-6 flex flex-col gap-3 hover:-translate-y-0.5 transition-transform"
          >
            {/* Color accent bar */}
            <div
              aria-hidden="true"
              className="w-10 h-1 rounded-full mb-1"
              style={{ backgroundColor: r.color }}
            />
            <h2 className="text-base font-semibold text-[var(--text-primary)] tracking-wide">
              {r.title}
            </h2>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed flex-1">
              {r.description}
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {r.chapters.map((ch) => (
                <Link
                  key={ch}
                  href={`/chapters/${ch}`}
                  className="text-xs px-2 py-0.5 rounded-full border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-accent)] hover:border-[var(--text-accent)]/40 hover:bg-[var(--hover-bg)] transition-all"
                >
                  {chapterTitles[ch] || ch}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
