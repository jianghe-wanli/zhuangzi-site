import { canonicalUrl, SITE_NAME, SITE_URL } from "@/lib/site";

/** 功能页通用结构化数据：WebPage + 两级面包屑（首页 → 本页），返回可直接内联的 JSON 字符串 */
export function breadcrumbJsonLd(title: string, path: string, description?: string): string {
  const url = canonicalUrl(path);
  return JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${url}#webpage`,
        url,
        name: `${title} — ${SITE_NAME}`,
        ...(description ? { description } : {}),
        inLanguage: "zh-Hans",
        isPartOf: { "@id": `${SITE_URL}/#website` },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "首页", item: canonicalUrl("/") },
          { "@type": "ListItem", position: 2, name: title, item: url },
        ],
      },
    ],
  }).replace(/</g, "\\u003c");
}
