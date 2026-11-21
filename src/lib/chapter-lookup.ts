/**
 * 篇章查找表（仅供 server component 使用）。
 *
 * metadata.json 约 50KB（含各篇提要与结语）。客户端岛只需要
 * 「id → 篇名 / 节数」这类几百字节的映射，由 server 页面算好后经 props 传入，
 * 不要在 "use client" 文件里直接 import chaptersMeta。
 */
import { chaptersMeta } from "@/data/chapters/metadata";

/** 客户端岛使用的精简篇章信息 */
export interface ChapterLite {
  id: string;
  title: string;
  category: string;
  passageCount: number;
}

export const chaptersLite: ChapterLite[] = chaptersMeta.map((m) => ({
  id: m.id,
  title: m.title,
  category: m.category,
  passageCount: m.passageCount,
}));

/** 带提要的篇章信息（阅读报告 / 阅读路径推荐用；不含 35KB 的各篇结语） */
export interface ChapterBrief extends ChapterLite {
  order: number;
  summary: string;
}

export const chaptersBrief: ChapterBrief[] = chaptersMeta.map((m) => ({
  id: m.id,
  title: m.title,
  category: m.category,
  passageCount: m.passageCount,
  order: m.order,
  summary: m.summary,
}));

/** chapterId → 篇名 */
export const chapterTitles: Record<string, string> = Object.fromEntries(
  chaptersMeta.map((m) => [m.id, m.title])
);
