import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // 只挡 AI 代理接口。
        // 个人数据页与站内搜索（/search/、/bookmarks/ 等）**不要**在这里 Disallow：
        // 它们靠页面里的 noindex 退出索引，而被 robots 挡住的页面爬虫读不到 noindex，
        // 又因全站导航都链着它们，反而会以「已编入索引，但被 robots.txt 屏蔽」的
        // 无标题条目出现在搜索结果里。
        disallow: ["/api/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
