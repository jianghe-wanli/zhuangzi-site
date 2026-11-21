import type { Metadata } from "next";

import { buildPageMetadata } from "@/lib/site";

import AskZhuangziChat from "./AskZhuangziChat";

export const metadata: Metadata = buildPageMetadata({
  title: "问庄子",
  description:
    "以《庄子》原文为依据的问答式阅读辅助 — 提出人生与哲学困惑，检索相关段落并结合庄子思想作出回应。",
  path: "/ask-zhuangzi",
});

export default function AskZhuangziPage() {
  return <AskZhuangziChat />;
}
