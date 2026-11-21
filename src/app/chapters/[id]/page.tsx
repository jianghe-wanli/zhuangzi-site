import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ScholarMarginNotesLazy, SelectionPopoverLazy } from "@/components/ChapterLazyIslands";
import ChapterTOC from "@/components/ChapterTOC";
import KeyboardNav from "@/components/KeyboardNav";
import PassageView from "@/components/PassageView";
import RecordReading from "@/components/RecordReading";
import RelatedReadings from "@/components/RelatedReadings";
import SentenceSyncController from "@/components/SentenceSyncController";
import StaticBlock from "@/components/StaticBlock";
import WordTooltipLayer from "@/components/WordTooltip";
import { chapters } from "@/data/chapters";
import { getAdjacentChapters } from "@/lib/chapters";
import { getPassageKaojuFangMap, getPassageKaojuMap } from "@/lib/kaoju";
import { canonicalUrl, ogImageFor, SITE_NAME } from "@/lib/site";
import { registerStaticBlocks, staticBlocksRev } from "@/lib/static-html";

import { chapterBlocks, chapterBlocksSrc, chapterConceptIds, chapterJsonLd } from "./blocks";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateStaticParams() {
  return chapters.map((ch) => ({ id: ch.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const chapter = chapters.find((c) => c.id === id);
  if (!chapter) return { title: "未找到" };
  const url = canonicalUrl(`/chapters/${chapter.id}`);
  const title = `${chapter.title} — ${chapter.category}`;
  // 每篇独立 OG 图（构建期生成，见 scripts/gen-og-images.mjs）
  const ogImage = ogImageFor(`/chapters/${chapter.id}`);
  return {
    title,
    description: chapter.summary,
    alternates: { canonical: url },
    openGraph: {
      title,
      description: chapter.summary,
      url,
      type: "article",
      locale: "zh_CN",
      siteName: SITE_NAME,
      images: [{ ...ogImage, alt: chapter.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} — ${SITE_NAME}`,
      description: chapter.summary,
      images: [ogImage.url],
    },
  };
}

export default async function ChapterPage({ params }: Props) {
  const { id } = await params;
  const chapter = chapters.find((c) => c.id === id);
  if (!chapter) notFound();

  const { prev, next } = getAdjacentChapters(id);
  const prevUrl = prev ? `/chapters/${prev.id}` : null;
  const nextUrl = next ? `/chapters/${next.id}` : null;

  const passageKaojuMap = getPassageKaojuMap(chapter.id);
  const passageKaojuFangMap = getPassageKaojuFangMap(chapter.id);
  const allConcepts = chapterConceptIds(chapter);
  const passageCount = chapter.passages.length;

  // 目录条目在服务端裁剪为 id + 短标题：原实现把整篇章节对象传给
  // 客户端 ChapterTOC，导致原文/译文/注疏全文被序列化进 RSC 载荷。
  const tocItems = chapter.passages.map((p, i) => ({
    id: p.id,
    label: `${i + 1}. ${p.original.slice(0, 12)}${p.original.length > 12 ? "…" : ""}`,
  }));

  // 正文（篇首/题解、各段原文·译文·注疏、篇末总结、上下篇导航）与 JSON-LD
  // 都是纯静态内容：作为静态块由 SSR 直出，不进 RSC 载荷。
  // 本组件输出的只有骨架与各客户端岛的标量 props。
  const src = chapterBlocksSrc(chapter.id);
  registerStaticBlocks(src, { ...chapterBlocks(chapter), ld: chapterJsonLd(chapter) });
  const rev = staticBlocksRev(src);

  return (
    <>
      <StaticBlock src={src} rev={rev} id="ld" as="script" type="application/ld+json" ssrOnly />
      <ChapterTOC items={tocItems} />
      <ScholarMarginNotesLazy
        chapterId={chapter.id}
        chapterTitle={chapter.title}
        passageCount={passageCount}
      />
      <RecordReading chapterId={chapter.id} chapterTitle={chapter.title} />
      <SelectionPopoverLazy chapterId={chapter.id} chapterTitle={chapter.title} />
      <SentenceSyncController />
      <WordTooltipLayer chapterId={chapter.id} />

      <div className="chapter-content-container max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 pb-24 sm:pb-14">
        {/* 篇首 + 题解 */}
        <StaticBlock src={src} rev={rev} id="head" />

        {/* Passages */}
        <div className="vertical-content">
          {chapter.passages.map((passage, idx) => (
            <div key={passage.id} id={`passage-${passage.id}`} className={idx >= 1 ? "cv-auto" : ""}>
              <div className={`flex items-center gap-3 mb-3 ${idx === 0 ? "mt-0" : "mt-10"}`}>
                <span className="text-xs font-medium text-[var(--text-muted)] tracking-[0.08em]">
                  {`第${idx + 1}节`}
                </span>
                <div className="flex-1 h-px bg-[var(--border-light)]" />
              </div>

              <PassageView
                passage={passage}
                chapterId={chapter.id}
                chapterTitle={chapter.title}
                passageNum={idx + 1}
                src={src}
                passageKaoju={passageKaojuMap[passage.id] ?? []}
                passageKaojuFang={passageKaojuFangMap[passage.id] ?? []}
              />
            </div>
          ))}
        </div>

        {/* 本篇总结 */}
        {chapter.conclusion && (
          <StaticBlock
            src={src} rev={rev}
            id="conclusion"
            as="section"
            className="cv-auto scroll-mt-24 mt-16 pt-8 border-t border-[var(--border-light)]"
          />
        )}

        <div className="cv-auto">
          <RelatedReadings chapterId={chapter.id} concepts={allConcepts} />
        </div>

        <StaticBlock
          src={src} rev={rev}
          id="nav"
          as="nav"
          className="cv-auto mt-14 pt-6 border-t border-[var(--border-light)] flex items-center justify-between"
        />

        <KeyboardNav prevUrl={prevUrl} nextUrl={nextUrl} />
      </div>
    </>
  );
}
