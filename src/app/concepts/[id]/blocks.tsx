import { StaticConceptTag } from "@/components/ConceptTag";
import { chapters } from "@/data/chapters";
import { passageNumber } from "@/data/chapters/metadata";
import { concepts } from "@/data/concepts";
import type { Concept } from "@/lib/chapters";
import { canonicalUrl, SITE_URL } from "@/lib/site";
import { internalHref, jsonLdString, renderStatic } from "@/lib/static-html";

export const conceptBlocksSrc = (id: string) => `/concepts/${id}/blocks.json`;

function relatedPassagesOf(concept: Concept) {
  return chapters.flatMap((ch) =>
    ch.passages
      .filter((p) => p.concepts.includes(concept.id))
      .map((p) => ({ chapter: ch, passage: p }))
  );
}

export function conceptJsonLd(concept: Concept): string {
  const conceptUrl = canonicalUrl(`/concepts/${concept.id}`);
  // 该概念在原文中出现的篇章，给搜索引擎一条实体→文本的关联。
  // 按篇去重：同一篇的多个段落此前会输出重复的 Chapter 条目。
  const subjectChapters = [...new Map(relatedPassagesOf(concept).map((rp) => [rp.chapter.id, rp.chapter])).values()];
  return jsonLdString({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "DefinedTerm",
        "@id": `${conceptUrl}#term`,
        name: concept.name,
        description: concept.summary,
        inLanguage: "zh-Hans",
        inDefinedTermSet: {
          "@type": "DefinedTermSet",
          "@id": `${SITE_URL}/concepts/#termset`,
          name: "庄子核心概念",
          url: canonicalUrl("/concepts"),
        },
        url: conceptUrl,
        mainEntityOfPage: { "@type": "WebPage", "@id": conceptUrl },
        subjectOf: subjectChapters.slice(0, 10).map((ch) => ({
          "@type": "Chapter",
          name: ch.title,
          url: canonicalUrl(`/chapters/${ch.id}`),
        })),
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${conceptUrl}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "首页", item: canonicalUrl("/") },
          { "@type": "ListItem", position: 2, name: "核心概念", item: canonicalUrl("/concepts") },
          { "@type": "ListItem", position: 3, name: concept.name, item: conceptUrl },
        ],
      },
    ],
  });
}

/** 概念页正文（纯静态；站内链接为普通 <a>，由 StaticBlock 委托 SPA 导航） */
export function conceptBlocks(concept: Concept): Record<string, string> {
  const relatedPassages = relatedPassagesOf(concept);
  const relatedConcepts = concept.relatedConcepts
    .map((cid) => concepts.find((c) => c.id === cid))
    .filter((c): c is Concept => Boolean(c));

  const body = renderStatic(
    <>
        {/* Header */}
        <div className="mb-10">
          <a
            href={internalHref("/concepts")}
            className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-accent)] transition-colors"
          >
            ← 全部概念
          </a>

          <h1 className="mt-4 text-3xl sm:text-4xl font-bold tracking-wider text-[var(--text-accent)]">
            {concept.name}
          </h1>

          <p className="mt-4 text-sm text-[var(--text-secondary)] leading-relaxed max-w-2xl">
            {concept.summary}
          </p>

          {concept.description && (
            <div className="mt-6 text-sm text-[var(--text-primary)] leading-relaxed space-y-2 max-w-2xl">
              {concept.description.split('\n\n').map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          )}

          {/* Related concepts */}
          {relatedConcepts.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="text-xs text-[var(--text-secondary)] self-center">
                关联概念：
              </span>
              {relatedConcepts.map((rc) =>
                rc ? (
                  <StaticConceptTag
                    key={rc.id}
                    conceptId={rc.id}
                    name={rc.name}
                    size="sm"
                  />
                ) : null
              )}
            </div>
          )}
        </div>

        {/* Related passages */}
        <section>
          <h2 className="text-lg font-medium mb-6 tracking-wide">
            相关段落
            <span className="text-sm text-[var(--text-secondary)] ml-2 font-normal">
              ({relatedPassages.length} 段)
            </span>
          </h2>

          {relatedPassages.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)] italic">
              暂无相关段落。
            </p>
          ) : (
            <div className="space-y-6">
              {relatedPassages.map(({ chapter, passage }, idx) => (
                <div
                  key={`${chapter.id}-${passage.id}`}
                  className={`p-4 sm:p-5 rounded-lg border border-[var(--border-light)] bg-[var(--bg-card)] ${idx >= 2 ? "cv-auto" : ""}`}
                >
                  <a
                    href={internalHref(`/chapters/${chapter.id}#passage-${passage.id}`)}
                    className="text-sm font-medium text-[var(--text-accent)] hover:underline"
                  >
                    {chapter.title} · 第 {passageNumber(chapter.id, passage.id) ?? "?"} 节
                  </a>
                  <p className="mt-2 text-sm text-[var(--text-primary)] leading-relaxed original-text">
                    {passage.original.length > 200
                      ? passage.original.slice(0, 200) + "…"
                      : passage.original}
                  </p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)] italic">
                    {passage.translation.length > 150
                      ? passage.translation.slice(0, 150) + "…"
                      : passage.translation}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* In which chapters */}
        <section className="mt-12 cv-auto">
          <h2 className="text-lg font-medium mb-4 tracking-wide">
            出现篇章
          </h2>
          <div className="flex flex-wrap gap-2">
            {concept.relatedChapters.map((chId) => {
              const ch = chapters.find((c) => c.id === chId);
              if (!ch) return null;
              return (
                <a
                  key={chId}
                  href={internalHref(`/chapters/${chId}`)}
                  className="px-3 py-1.5 rounded border border-[var(--border-color)] text-sm text-[var(--text-secondary)] hover:text-[var(--text-accent)] hover:border-[var(--text-accent)] transition-colors"
                >
                  {ch.title}
                </a>
              );
            })}
          </div>
        </section>
    </>
  );
  return { body };
}
