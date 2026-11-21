import Link from "next/link";

/** 无批注参数时的说明页。server 直出为静态 HTML，同时充当 Suspense fallback。 */
export default function SharedAnnotationEmpty() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 text-center">
      <h1 className="text-3xl font-bold tracking-wide mb-4">共享批注</h1>
      <div className="p-6 rounded-lg border border-[var(--border-light)] bg-[var(--bg-card)]">
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          此页面用于展示他人分享的段落批注。
        </p>
        <p className="text-xs text-[var(--text-secondary)]">
          需要包含批注参数的链接才能查看。你可以从任意段落点击分享按钮生成链接。
        </p>
        <Link
          href="/chapters/01-xiaoyao-you"
          className="inline-block mt-4 text-sm text-[var(--text-accent)] hover:underline"
        >
          ← 去阅读逍遥游
        </Link>
      </div>
    </div>
  );
}
