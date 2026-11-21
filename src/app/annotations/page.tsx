import type { Metadata } from "next";
import { Suspense } from "react";

import { chapterTitles } from "@/lib/chapter-lookup";
import { buildPageMetadata } from "@/lib/site";

import SharedAnnotation from "./SharedAnnotation";
import SharedAnnotationEmpty from "./SharedAnnotationEmpty";

export const metadata: Metadata = buildPageMetadata({
  title: "我的批注",
  description:
    "你为《庄子》段落所作的个人批注，按篇章与节次归类，支持导出备份。数据仅保存在本地浏览器。",
  path: "/annotations",
  index: false,
});

export default function AnnotationsPage() {
  // useSearchParams 需要 Suspense；fallback 用说明页本身，静态 HTML 不再只有「加载中…」
  return (
    <Suspense fallback={<SharedAnnotationEmpty />}>
      <SharedAnnotation chapterTitles={chapterTitles} />
    </Suspense>
  );
}
