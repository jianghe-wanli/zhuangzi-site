import type { Metadata } from "next";
import { notFound } from "next/navigation";

import StaticBlock from "@/components/StaticBlock";
import { concepts } from "@/data/concepts";
import { canonicalUrl, ogImageFor, SITE_NAME } from "@/lib/site";
import { registerStaticBlocks, staticBlocksRev } from "@/lib/static-html";

import { conceptBlocks, conceptBlocksSrc, conceptJsonLd } from "./blocks";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateStaticParams() {
  return concepts.map((c) => ({ id: c.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const concept = concepts.find((c) => c.id === id);
  if (!concept) return { title: "未找到" };
  const url = canonicalUrl(`/concepts/${concept.id}`);
  // 每概念独立 OG 图（构建期生成，见 scripts/gen-og-images.mjs）
  const ogImage = ogImageFor(`/concepts/${concept.id}`);
  return {
    title: concept.name,
    description: concept.summary,
    alternates: { canonical: url },
    openGraph: {
      title: `${concept.name} — 庄子核心概念`,
      description: concept.summary,
      url,
      type: "article",
      locale: "zh_CN",
      siteName: SITE_NAME,
      images: [{ ...ogImage, alt: concept.name }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${concept.name} — 庄子核心概念`,
      description: concept.summary,
      images: [ogImage.url],
    },
  };
}

export default async function ConceptPage({ params }: Props) {
  const { id } = await params;
  const concept = concepts.find((c) => c.id === id);
  if (!concept) notFound();

  // 整页正文是纯静态内容：作为静态块由 SSR 直出，不进 RSC 载荷
  // （/concepts/dao 原先 HTML 的 55% 是同一份正文的 RSC 副本）。
  const src = conceptBlocksSrc(concept.id);
  registerStaticBlocks(src, { ...conceptBlocks(concept), ld: conceptJsonLd(concept) });
  const rev = staticBlocksRev(src);

  return (
    <>
      <StaticBlock src={src} rev={rev} id="ld" as="script" type="application/ld+json" ssrOnly />
      <StaticBlock src={src} rev={rev} id="body" className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16" />
    </>
  );
}
