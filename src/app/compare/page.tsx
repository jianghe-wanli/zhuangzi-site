import type { Metadata } from "next";

import { breadcrumbJsonLd } from "@/lib/breadcrumb-jsonld";
import { buildPageMetadata } from "@/lib/site";

import CompareDebate from "./CompareDebate";

export const metadata: Metadata = buildPageMetadata({
  title: "诸子对谈",
  description:
    "庄子与老子、孔子、孟子、荀子、韩非等先秦诸子的思想对照 — 同一命题下不同学派的立场差异与互相呼应。",
  path: "/compare",
});

export default function ComparePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: breadcrumbJsonLd("诸子对谈", "/compare") }}
      />
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-wide mb-2">诸子对谈</h1>
        <p className="text-sm text-[var(--text-secondary)] mb-6">
          同一话题，不同视角。选一个话题，看诸子如何各抒己见
        </p>
        <CompareDebate />
      </div>
    </>
  );
}
