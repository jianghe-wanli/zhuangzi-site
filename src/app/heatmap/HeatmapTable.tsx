"use client";

import { useState } from "react";

import type { HeatmapRow } from "@/lib/concordance-data";

const WORD_COUNTS = [10, 20, 30, 50];

/**
 * 词频热图表格（客户端岛）。
 * 数据由 server 页面压成「词 × 篇」的数字矩阵传入（约 4KB），
 * 不再把 116KB 的 concordance.json 打进本路由 JS。
 * 单元格样式集中在 <table> 的后代选择器上，每格只带一个 --i 变量，
 * 首屏 HTML 不再为 660 个格子各重复一整串 class + style。
 */
export default function HeatmapTable({
  rows,
  chapters,
}: {
  rows: HeatmapRow[];
  chapters: { id: string; title: string; short: string }[];
}) {
  const [maxWords, setMaxWords] = useState(20);

  return (
    <>
      {/* 显示前 N 个高频词：分段按钮（视觉复审 V7-1，替换原生 select） */}
      <div className="mb-6 flex items-center gap-2 flex-wrap">
        <span className="text-xs text-[var(--text-secondary)]">显示前</span>
        <div className="flex gap-1" role="group" aria-label="显示高频词数量">
          {WORD_COUNTS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setMaxWords(n)}
              aria-pressed={maxWords === n}
              className={`min-w-[36px] px-2 py-1 text-xs rounded transition-colors ${
                maxWords === n
                  ? "bg-[var(--text-accent)]/12 text-[var(--text-accent)] font-medium ring-1 ring-[var(--text-accent)]/30"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)]"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <span className="text-xs text-[var(--text-secondary)]">个高频词</span>
      </div>

      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="词频分布热图">
        <table className="w-full text-xs border-collapse [&_td]:text-center [&_td]:py-2 [&_td]:px-1 [&_td]:font-mono [&_td[style]]:bg-[color-mix(in_srgb,var(--text-accent)_var(--i),transparent)] [&_td[data-hi]]:text-[var(--bg-primary)]">
          <caption className="sr-only">高频词在《庄子》三十三篇中的出现段落数</caption>
          <thead>
            <tr>
              <th scope="col" className="text-left py-2 pr-3 font-medium text-[var(--text-secondary)] sticky left-0 bg-[var(--bg-primary)] z-10">词</th>
              <th scope="col" className="text-center py-2 px-1 font-medium text-[var(--text-secondary)]">总计</th>
              {chapters.map((ch) => (
                <th key={ch.id} scope="col" className="text-center py-2 px-1 font-medium text-[var(--text-secondary)]" title={ch.title}>
                  <abbr title={ch.title} className="no-underline">{ch.short}</abbr>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, maxWords).map((w) => {
              const max = Math.max(...w.perChapter, 1);
              return (
                <tr key={w.word} className="border-t border-[var(--border-light)]">
                  <th scope="row" className="text-left py-2 pr-3 font-medium text-[var(--text-primary)] sticky left-0 bg-[var(--bg-primary)]">{w.word}</th>
                  <td className="text-[var(--text-accent)]">{w.count}</td>
                  {w.perChapter.map((val, i) => {
                    if (val === 0) return <td key={i} />;
                    const intensity = Math.min(0.1 + (val / max) * 0.7, 0.8);
                    return (
                      <td
                        key={i}
                        data-hi={intensity > 0.5 ? "" : undefined}
                        style={{ "--i": `${Math.round(intensity * 100)}%` } as React.CSSProperties}
                      >
                        {val}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
