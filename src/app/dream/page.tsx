import type { Metadata } from "next";

import { breadcrumbJsonLd } from "@/lib/breadcrumb-jsonld";
import { buildPageMetadata } from "@/lib/site";

import DreamStory from "./DreamStory";

export const metadata: Metadata = buildPageMetadata({
  title: "庄周梦蝶",
  description:
    "围绕「庄周梦蝶」展开的物化与真幻之思 — 齐物论名段的原文、译解，以及关于自我同一性的哲学延展。",
  path: "/dream",
});

export default function DreamPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: breadcrumbJsonLd("庄周梦蝶", "/dream") }}
      />
      <DreamStory />
    </>
  );
}
