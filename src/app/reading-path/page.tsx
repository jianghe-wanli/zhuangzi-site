import type { Metadata } from "next";

import { chaptersBrief } from "@/lib/chapter-lookup";
import { buildPageMetadata } from "@/lib/site";

import { CHAPTER_MAP } from "./chapter-map";
import ReadingPathQuiz from "./ReadingPathQuiz";

export const metadata: Metadata = buildPageMetadata({
  title: "阅读进度",
  description:
    "记录并规划你的《庄子》通读进度，按内篇、外篇、杂篇查看已读篇章与剩余篇目。",
  path: "/reading-path",
  index: false,
});

// 只把问卷可能推荐到的篇章（含提要）传给客户端岛，而不是整份 50KB 的篇章元数据
const recommendableIds = new Set(Object.values(CHAPTER_MAP).flat());
const recommendable = chaptersBrief.filter((c) => recommendableIds.has(c.id));

export default function ReadingPathPage() {
  return <ReadingPathQuiz chapters={recommendable} />;
}
