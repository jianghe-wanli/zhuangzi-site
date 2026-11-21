import "./globals.css";

import type { Metadata, Viewport } from "next";

import ChatFab from "@/components/ChatFab";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import ReadingProgress from "@/components/ReadingProgress";
import ShortcutsHelp from "@/components/ShortcutsHelp";
import SWRegister from "@/components/SWRegister";
import { buildInlineReadingPrefsScript } from "@/lib/reading-prefs";
import { canonicalUrl, OG_IMAGE, SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/site";
import { buildInlineThemeScript, DEFAULT_THEME, themes } from "@/lib/theme";

// 字体：系统字体栈 + 自托管分片宋体。@font-face 规则在 globals.css
// （@import "./font-faces.css"）里，随外置样式表一次下载、跨页缓存；
// 不要内联回 <head> —— 服务端组件的 props 会原样进 RSC 载荷，
// 24KB 规则会在每个页面的 HTML 里出现两次。

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    template: `%s — ${SITE_NAME}`,
    default: SITE_TAGLINE,
  },
  description:
    "庄子全文解读 — 内篇七篇、外篇十五篇、杂篇十一篇。原文、白话翻译与深度解读，包含概念知识图谱、词语索引、寓言故事、名句精选、地理地图和主题阅读路线。",
  keywords: [
    "庄子", "庄子全文", "逍遥游", "道家", "庄子解读", "庄子译文",
    "庄子寓言", "齐物论", "养生主", "秋水", "庄子哲学", "南华真经",
    "古典文学", "先秦哲学", "国学经典",
  ],
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "zh_CN",
    url: canonicalUrl("/"),
    siteName: SITE_NAME,
    title: SITE_TAGLINE,
    description:
      "内篇精粹、外篇广博、杂篇绚烂。全文解读、白话翻译、概念图谱、词语索引。",
    images: [{ ...OG_IMAGE, alt: SITE_TAGLINE }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TAGLINE,
    description:
      "内篇精粹、外篇广博、杂篇绚烂。全文解读、白话翻译、概念图谱、词语索引。",
    images: [OG_IMAGE.url],
  },
  // ⚠️ 这里**不能**设置 alternates.canonical。
  // Next.js 的 metadata 会向下继承：根布局写死 canonical=首页后，所有未在
  // 自身 generateMetadata 里覆盖它的路由（此前共 22 个，含 /chapters、
  // /concepts、/quotes、/fables、/timeline 等枢纽页）都会输出
  // <link rel="canonical" href="首页">，等于告诉搜索引擎「我是首页的副本」，
  // 从而被判重去索引。canonical 现由各路由自行声明。
  alternates: undefined,
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "莊子",
  },
  manifest: "/manifest.json",
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // 允许缩放：古籍阅读中读者常需放大辨认生僻字，禁用缩放属无障碍缺陷
  maximumScale: 5,
  userScalable: true,
  themeColor: themes[DEFAULT_THEME].themeColor,
  colorScheme: "light dark",
};

// 站点级 JSON-LD：WebSite（含站内搜索）+ Organization + 作为丛书的 Book
const siteJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: SITE_NAME,
      alternateName: "庄子数位典藏",
      url: canonicalUrl("/"),
      description:
        "庄子全文解读 — 内篇七篇、外篇十五篇、杂篇十一篇。原文、白话翻译与深度解读。",
      inLanguage: "zh-Hans",
      publisher: { "@id": `${SITE_URL}/#organization` },
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${canonicalUrl("/search")}?q={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: canonicalUrl("/"),
      logo: { "@type": "ImageObject", url: OG_IMAGE.url },
    },
    {
      "@type": "Book",
      "@id": `${SITE_URL}/#book`,
      name: "庄子",
      alternateName: ["南华真经", "莊子"],
      inLanguage: "zh-Hant",
      numberOfPages: 33,
      bookEdition: "今本三十三篇（内篇七、外篇十五、杂篇十一）",
      author: {
        "@type": "Person",
        name: "庄周",
        alternateName: "庄子",
        birthDate: "-0369",
        deathDate: "-0286",
        description: "战国时期宋国蒙人，道家学派代表人物。",
        sameAs: "https://www.wikidata.org/wiki/Q4700",
      },
      genre: ["哲学", "先秦诸子", "道家"],
      url: canonicalUrl("/chapters"),
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-Hans"
      className="h-full antialiased"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <head>
        {/* Cloudflare Web Analytics — replace token to enable */}
        {/* <script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "YOUR_TOKEN"}'></script> */}

        {/* 首帧前同步执行：① 主题（写 <html data-theme>，调色板在 globals.css）
            ② 阅读排版偏好（字号/行距/版心/夹注），避免水合后整体重排。
            两段都只含构建期常量；每页要付两次（<script> + RSC），务必保持精简 */}
        <script
          dangerouslySetInnerHTML={{ __html: buildInlineThemeScript() + ";" + buildInlineReadingPrefsScript() }}
        />

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(siteJsonLd) }}
        />
      </head>
      <body className="min-h-full flex flex-col font-serif">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-[var(--bg-card)] focus:text-[var(--text-accent)] focus:border focus:border-[var(--border-color)] focus:shadow-lg"
        >
          跳到主要内容
        </a>
        {/*
          章节页减重 v2：页面主体**不经过任何 client 祖先**。
          静态导出会把 client 组件的 server children 完整序列化进 RSC 载荷
          （此前 LayoutClient 包裹整页，是章节页 33 万字符重复载荷的根源），
          现在 Navigation / 进度条 / 页脚 / SW 注册 / 聊天球全部与 <main>
          并列渲染；沉浸模式由 CSS（html.immersive-mode）隐藏各 chrome。
        */}
        <Navigation />
        <ReadingProgress />
        {/* min-h：主体至少占满导航以下的一屏，页脚初始必在首屏之外。
            否则短页面（/search 等客户端渲染页）水合后内容长高，会把已在
            视口内的页脚顶下去 —— Lighthouse 实测 /search CLS 0.089 全部来自页脚。 */}
        <main id="main-content" tabIndex={-1} className="flex-1 min-h-[calc(100svh-3.5rem)] outline-none">{children}</main>
        <Footer />
        <ChatFab />
        <ShortcutsHelp />
        <SWRegister />
      </body>
    </html>
  );
}
