import type { Metadata } from "next";

import { breadcrumbJsonLd } from "@/lib/breadcrumb-jsonld";
import { buildPageMetadata } from "@/lib/site";

import AskZhuangziChat from "./AskZhuangziChat";

export const metadata: Metadata = buildPageMetadata({
  title: "问庄子",
  description:
    "以《庄子》原文为依据的问答式阅读辅助 — 提出人生与哲学困惑，检索相关段落并结合庄子思想作出回应。",
  path: "/ask-zhuangzi",
});

export default function AskZhuangziPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: breadcrumbJsonLd("问庄子", "/ask-zhuangzi") }}
      />
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-wide mb-2">问庄子</h1>
        <p className="text-sm text-[var(--text-secondary)] mb-6">
          心有困惑？与庄子对谈，以古人之智慧解今人之心结
        </p>
        <AskZhuangziChat />
      </div>
    </>
  );
}
