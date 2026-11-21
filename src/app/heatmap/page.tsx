import type { Metadata } from "next";

import { chaptersMeta } from "@/data/chapters/metadata";
import { breadcrumbJsonLd } from "@/lib/breadcrumb-jsonld";
import { concordanceWordCount, heatmapRows } from "@/lib/concordance-data";
import { buildPageMetadata } from "@/lib/site";

import HeatmapTable from "./HeatmapTable";

export const metadata: Metadata = buildPageMetadata({
  title: "词频热图",
  description:
    "《庄子》全书词频数据可视化 — 以热力图呈现核心语汇在内篇、外篇、杂篇各章的分布密度与用词偏好差异。",
  path: "/heatmap",
});

// 表头用篇名前两字（与改造前一致），完整篇名放 title
const chapters = chaptersMeta.map((m) => ({ id: m.id, title: m.title, short: m.title.slice(0, 2) }));
const rows = heatmapRows(50);

export default function HeatmapPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: breadcrumbJsonLd("词频热图", "/heatmap") }}
      />
      <h1 className="text-3xl font-bold tracking-wide mb-2">词频分布</h1>
      <p className="text-sm text-[var(--text-secondary)] mb-6">
        {concordanceWordCount} 个词的篇章分布热图
      </p>
      <HeatmapTable rows={rows} chapters={chapters} />
    </div>
  );
}
