"use client";

import dynamic from "next/dynamic";

// d3 力导向图体积大（约300KB），客户端按需加载，避免阻塞概念页首屏
const ThoughtMap = dynamic(() => import("@/components/ThoughtMap"), {
  ssr: false,
  loading: () => (
    // 与 ThoughtMap 画布同高同框，图加载完成时不推挤下方内容
    <div
      role="status"
      className="h-[460px] sm:h-[560px] rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] flex items-center justify-center text-sm text-[var(--text-secondary)]"
    >
      加载思想脉络图中…
    </div>
  ),
});

export default function ThoughtMapWrapper() {
  return (
    <>
      <noscript>
        <p className="text-center text-sm text-[var(--text-secondary)]">
          思想脉络图需要启用 JavaScript；各概念及其所在篇章见下方「全部概念」。
        </p>
      </noscript>
      <ThoughtMap />
    </>
  );
}
