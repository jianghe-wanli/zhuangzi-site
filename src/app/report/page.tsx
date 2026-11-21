import type { Metadata } from "next";

import { chaptersBrief } from "@/lib/chapter-lookup";
import { buildPageMetadata } from "@/lib/site";

import ReadingReport from "./ReadingReport";

export const metadata: Metadata = buildPageMetadata({
  title: "阅读报告",
  description:
    "根据本地阅读记录生成的《庄子》阅读统计报告 — 已读篇章、覆盖率、阅读时段与偏好主题。",
  path: "/report",
  index: false,
});

export default function ReportPage() {
  return <ReadingReport chapters={chaptersBrief} />;
}
