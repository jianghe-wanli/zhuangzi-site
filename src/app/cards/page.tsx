import type { Metadata } from "next";

import quotesData from "@/data/quotes.json";
import { buildPageMetadata } from "@/lib/site";

import CardMaker, { type Quote } from "./CardMaker";

export const metadata: Metadata = buildPageMetadata({
  title: "名言卡片",
  description:
    "把《庄子》名句生成可保存分享的图文卡片，支持多种配色与版式。",
  path: "/cards",
  index: false,
});

// 只把笺纸用到的字段传给客户端岛（不带译文与用法说明）
const quotes: Quote[] = quotesData.quotes.map((q) => ({
  id: q.id,
  text: q.text,
  chapter: q.chapter,
  chapterId: q.chapterId,
  passageId: q.passageId,
  theme: q.theme,
  explanation: q.explanation,
}));

export default function CardsPage() {
  return <CardMaker quotes={quotes} />;
}
