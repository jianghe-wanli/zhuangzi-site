import type { Metadata } from "next";

import { buildPageMetadata } from "@/lib/site";

import ReciteGame from "./ReciteGame";

export const metadata: Metadata = buildPageMetadata({
  title: "名句背诵",
  description:
    "《庄子》名句挖空背诵练习 — 四十四句传世名句随机挖空填字，逐字批改正误，配合拼音与译文巩固记忆。",
  path: "/recite",
});

export default function RecitePage() {
  return <ReciteGame />;
}
