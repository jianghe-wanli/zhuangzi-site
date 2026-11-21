import type { Metadata } from "next";

import { chapterTitles } from "@/lib/chapter-lookup";
import { buildPageMetadata } from "@/lib/site";

import BookmarksClient from "./BookmarksClient";

export const metadata: Metadata = buildPageMetadata({
  title: "我的收藏",
  description:
    "你收藏的《庄子》段落，按篇章归类，可回跳原文定位。数据仅保存在本地浏览器。",
  path: "/bookmarks",
  index: false,
});

export default function BookmarksPage() {
  return <BookmarksClient chapterTitles={chapterTitles} />;
}
