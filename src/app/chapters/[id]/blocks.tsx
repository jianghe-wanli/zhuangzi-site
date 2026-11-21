import { StaticConceptTag } from "@/components/ConceptTag";
import { locateQuoteInOriginal, passageBlocks, type PassageQuote } from "@/components/PassageView";
import { concepts as conceptsData } from "@/data/concepts";
import quotesData from "@/data/quotes.json";
import { type Chapter, getAdjacentChapters } from "@/lib/chapters";
import { getKaojuByChapter, getKaojuFangByChapter } from "@/lib/kaoju";
import { canonicalUrl, CONTENT_LAST_MODIFIED, SITE_URL } from "@/lib/site";
import { internalHref, jsonLdString, renderStatic } from "@/lib/static-html";

export const chapterBlocksSrc = (id: string) => `/chapters/${id}/blocks.json`;

/** 题解区智能按句号截取导读摘要（140~240 字符内寻完整句末，避免半句腰斩） */
function getConclusionSummary(text: string): string {
  if (text.length <= 220) return text;
  const slice = text.slice(0, 240);
  const lastPeriod = slice.lastIndexOf("。");
  if (lastPeriod >= 130) {
    return slice.slice(0, lastPeriod + 1);
  }
  const lastPunct = Math.max(slice.lastIndexOf("；"), slice.lastIndexOf("！"));
  if (lastPunct >= 130) {
    return slice.slice(0, lastPunct + 1);
  }
  return text.slice(0, 200) + "…";
}

const knownConceptIds = new Set(conceptsData.map((c) => c.id));

/** 本篇涉及的概念 id（去重，仅保留概念库中存在的） */
export function chapterConceptIds(chapter: Chapter): string[] {
  return [...new Set(chapter.passages.flatMap((p) => p.concepts))].filter((cid) => knownConceptIds.has(cid));
}

export function chapterJsonLd(chapter: Chapter): string {
  const chapterUrl = canonicalUrl(`/chapters/${chapter.id}`);
  const conceptNames = chapterConceptIds(chapter)
    .map((cid) => conceptsData.find((c) => c.id === cid)?.name)
    .filter((n): n is string => Boolean(n));
  return jsonLdString({
            "@context": "https://schema.org",
            "@graph": [
              {
                // Chapter 比泛化的 Article 更贴合「书中一篇」的实体类型，
                // 并通过 isPartOf 挂到根布局声明的 Book 上，形成整书结构。
                "@type": ["Chapter", "Article"],
                "@id": `${chapterUrl}#chapter`,
                headline: chapter.title,
                name: chapter.title,
                description: chapter.summary,
                inLanguage: "zh-Hans",
                // 原为硬编码的 "2026-07-29" —— 未来日期会被搜索引擎判为无效，
                // 且缺 dateModified。改为构建期常量。
                datePublished: CONTENT_LAST_MODIFIED,
                dateModified: CONTENT_LAST_MODIFIED,
                position: chapter.order,
                wordCount: chapter.passages.reduce(
                  (n, p) => n + p.original.length,
                  0
                ),
                author: { "@type": "Person", name: "庄周", alternateName: "庄子" },
                publisher: { "@id": `${SITE_URL}/#organization` },
                mainEntityOfPage: { "@type": "WebPage", "@id": chapterUrl },
                isPartOf: { "@id": `${SITE_URL}/#book` },
                about: conceptNames.map((n) => ({
                  "@type": "DefinedTerm",
                  name: n,
                })),
                url: chapterUrl,
              },
              {
                // 面包屑：此前全站没有 BreadcrumbList，搜索结果里拿不到层级路径
                "@type": "BreadcrumbList",
                "@id": `${chapterUrl}#breadcrumb`,
                itemListElement: [
                  {
                    "@type": "ListItem",
                    position: 1,
                    name: "首页",
                    item: canonicalUrl("/"),
                  },
                  {
                    "@type": "ListItem",
                    position: 2,
                    name: "篇章",
                    item: canonicalUrl("/chapters"),
                  },
                  {
                    "@type": "ListItem",
                    position: 3,
                    name: chapter.title,
                    item: chapterUrl,
                  },
                ],
              },
            ],
          });
}

/**
 * 本篇名句按段落分组（只保留能在对应段落原文中精确定位的句子），
 * 供原文内嵌高亮 + 跳转 /quotes 锚点（对标古诗文网名句标记）。
 * 定位用 locateQuoteInOriginal 两级匹配（去句末标点 / 去全部标点回映射），
 * 标记文本以原文切片渲染 —— 引文数据与原文标点常不一致。
 */
function quotesByPassageOf(chapter: Chapter): Map<string, PassageQuote[]> {
  const quotesByPassage = new Map<string, PassageQuote[]>();
  for (const q of quotesData.quotes) {
    if (q.chapterId !== chapter.id) continue;
    const passage = chapter.passages.find((p) => p.id === q.passageId);
    if (!passage) continue;
    const slice = locateQuoteInOriginal(q.text, passage.original);
    if (!slice) continue;
    const list = quotesByPassage.get(q.passageId) ?? [];
    list.push({ id: q.id, text: slice, theme: q.theme, explanation: q.explanation });
    quotesByPassage.set(q.passageId, list);
  }
  return quotesByPassage;
}

/** 章节页全部静态块（纯静态；站内链接为普通 <a>，由 StaticBlock 委托 SPA 导航） */
export function chapterBlocks(chapter: Chapter): Record<string, string> {
  const { prev, next } = getAdjacentChapters(chapter.id);
  const kaoju = getKaojuByChapter(chapter.id);
  const kaojuCount = kaoju.length;
  const fangKaojuCount = getKaojuFangByChapter(chapter.id).length;
  const allConcepts = chapterConceptIds(chapter);
  const passageCount = chapter.passages.length;
  const quotesByPassage = quotesByPassageOf(chapter);

  const blocks: Record<string, string> = {
    head: renderStatic(
      <>
        <div className="mb-12">
          <div className="flex items-center gap-2 mb-4">
            <a href={internalHref("/chapters")} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-accent)] transition-colors">
              ← 篇章
            </a>
            <span className="text-[10px] text-[var(--text-muted)]">/</span>
            <span className="tag text-[10px]">{chapter.category}</span>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-[0.04em] text-[var(--text-accent)] mb-3">
            {chapter.title}
          </h1>

          <p className="text-sm text-[var(--text-secondary)] leading-relaxed max-w-xl">
            {chapter.summary}
          </p>

          <div className="flex items-center gap-3 mt-4 text-xs text-[var(--text-muted)]">
            <span>{chapter.category} · 第{chapter.order}篇</span>
            <span className="opacity-30">|</span>
            <span>{passageCount} 节</span>
            {kaojuCount > 0 && (
              <>
                <span className="opacity-30">|</span>
                <span>{kaojuCount} 条注 · {fangKaojuCount} 条训诂</span>
              </>
            )}
            {allConcepts.length > 0 && (
              <>
                <span className="opacity-30">|</span>
                <span>{allConcepts.length} 个核心概念</span>
              </>
            )}
          </div>
        </div>

        {/* 题解 */}
        <div className="card p-6 sm:p-8 mb-14">
          <h2 className="text-base font-semibold text-[var(--text-accent)] tracking-[0.06em] mb-4">
            题解
          </h2>
          <div className="text-sm text-[var(--text-primary)] leading-[1.85] space-y-3 reading-prose">
            {chapter.intro ? (
              <>
                <p>{chapter.intro}</p>
                <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                  <span className="inline-block w-3 h-px bg-[var(--border-light)]" />
                  <span>题解出自陈鼓应《庄子今注今译》</span>
                </div>
              </>
            ) : (
              <p>
                {chapter.category === "内篇"
                  ? `《${chapter.title}》为庄子内篇第${chapter.order}篇，庄子亲著。${chapter.summary}`
                  : chapter.category === "外篇"
                    ? `《${chapter.title}》为庄子外篇之一，一般认为是庄子后学所作。${chapter.summary}`
                    : `《${chapter.title}》为庄子杂篇之一，收录于《南华真经》。${chapter.summary}`}
              </p>
            )}
            {chapter.conclusion && (
              <div className="pt-2 mt-2 border-t border-[var(--border-light)]">
                <p>
                  {getConclusionSummary(chapter.conclusion)}
                  <a
                    href="#chapter-conclusion"
                    className="ml-2 inline-flex items-center text-xs text-[var(--text-accent)] hover:underline"
                  >
                    阅览篇末总结 ↓
                  </a>
                </p>
              </div>
            )}
          </div>

          {allConcepts.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-4 pt-3 border-t border-[var(--border-light)]">
              <span className="text-[11px] text-[var(--text-muted)] mr-1 self-center">关联概念：</span>
              {allConcepts.slice(0, 8).map((cid) => (
                <StaticConceptTag key={cid} conceptId={cid} size="sm" />
              ))}
              {allConcepts.length > 8 && (
                <a href={internalHref("/concepts")} className="text-[11px] text-[var(--text-accent)] hover:underline self-center ml-1">
                  +{allConcepts.length - 8} 个
                </a>
              )}
            </div>
          )}
        </div>
      </>
    ),
    nav: renderStatic(
      <>
          {prev ? (
            <a href={internalHref(`/chapters/${prev.id}`)} className="group flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-accent)] transition-colors">
              <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
              <span className="hidden sm:inline">上一篇：</span>
              <span className="font-medium">{prev.title}</span>
            </a>
          ) : <div />}

          {next ? (
            <a href={internalHref(`/chapters/${next.id}`)} className="group flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-accent)] transition-colors">
              <span className="font-medium">{next.title}</span>
              <span className="hidden sm:inline">：下一篇</span>
              <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </a>
          ) : <div />}
      </>
    ),
  };
  if (chapter.conclusion) {
    blocks.conclusion = renderStatic(
      <>
            <h2 className="text-lg font-semibold text-[var(--text-accent)] tracking-[0.06em] mb-5">
              本篇总结
            </h2>
            <div className="text-sm text-[var(--text-primary)] leading-[1.85] space-y-3 reading-prose">
              {chapter.conclusion.split("\n").filter(Boolean).map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
      </>
    );
  }
  for (const passage of chapter.passages) {
    Object.assign(blocks, passageBlocks({ passage, kaoju, quotes: quotesByPassage.get(passage.id) }));
  }
  return blocks;
}
