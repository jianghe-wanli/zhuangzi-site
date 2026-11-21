import type { Metadata } from "next";

import { chapters } from "@/data/chapters";
import { buildPageMetadata } from "@/lib/site";

import TranslateChallenge, { type ChallengeItem } from "./TranslateChallenge";

export const metadata: Metadata = buildPageMetadata({
  title: "译文挑战",
  description:
    "《庄子》文言翻译练习 — 给出原文段落，自行翻译后与参考译文逐句对照，检验对虚词、句式与文意的把握。",
  path: "/translate-challenge",
});

// 题库在构建期筛好（15–80 字的段落），客户端不必再下载全量篇章数据
const items: ChallengeItem[] = chapters.flatMap((ch) =>
  ch.passages
    .filter((p) => p.original.length >= 15 && p.original.length <= 80)
    .map((p) => ({ original: p.original, chapterTitle: ch.title }))
);

export default function TranslateChallengePage() {
  return <TranslateChallenge items={items} />;
}
