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

/**
 * 段落工具条图标的 SVG sprite（PassageToolbar 的 <use href="#tb-…"> 引用）。
 * 每个图标的 path 全页只出现这一次，而不是每段每个按钮各内联一份。
 */
const TOOLBAR_ICONS: Record<string, string> = {
  star: "M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z",
  pencil: "M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z",
  check: "M4.5 12.75l6 6 9-13.5",
  clipboard: "M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184",
  link: "M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244",
  "eye-off": "M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88",
  columns: "M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125z",
  stop: "M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z",
  speaker: "M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z",
};

function ToolbarSprite() {
  return (
    <svg aria-hidden="true" className="hidden">
      {Object.entries(TOOLBAR_ICONS).map(([name, d]) => (
        <symbol key={name} id={`tb-${name}`} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d={d} />
        </symbol>
      ))}
    </svg>
  );
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
        <ToolbarSprite />
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
