import type { Metadata } from "next";

import { buildPageMetadata } from "@/lib/site";

import CardMaker from "./CardMaker";

export const metadata: Metadata = buildPageMetadata({
  title: "名言卡片",
  description:
    "把《庄子》名句生成可保存分享的图文卡片，支持多种配色与版式。",
  path: "/cards",
  index: false,
});

export default function CardsPage() {
  return <CardMaker />;
}
