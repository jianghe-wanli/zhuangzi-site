import type { Metadata } from "next";

import { buildPageMetadata } from "@/lib/site";

import CompareDebate from "./CompareDebate";

export const metadata: Metadata = buildPageMetadata({
  title: "诸子对谈",
  description:
    "庄子与老子、孔子、孟子、荀子、韩非等先秦诸子的思想对照 — 同一命题下不同学派的立场差异与互相呼应。",
  path: "/compare",
});

export default function ComparePage() {
  return <CompareDebate />;
}
