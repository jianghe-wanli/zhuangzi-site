"use client";

import { useMemo, useState } from "react";

import timelineData from "@/data/timeline.json";

interface TimelineEvent {
  year: string;
  yearSort: number;
  event: string;
  description: string;
  category: string;
}

// 2026-08-24 视觉复审：原 #3b82f6/#22c55e 高饱和蓝绿跳出全站水墨调色板，
// 改为降饱和的靛灰（战国）与竹绿（人物），与赭石（生平）成三色系。
const categoryStyles: Record<string, { border: string; bg: string; dot: string }> = {
  "庄子生平": { border: "var(--text-accent)", bg: "rgba(139,94,60,0.06)", dot: "var(--text-accent)" },
  "战国事件": { border: "#6E7F92", bg: "rgba(110,127,146,0.07)", dot: "#6E7F92" },
  "人物": { border: "#7C8B6F", bg: "rgba(124,139,111,0.07)", dot: "#7C8B6F" },
};

// 模块级排一次序（原实现每次筛选都对 import 进来的数组原地 sort）
const sortedEvents = [...(timelineData as TimelineEvent[])].sort((a, b) => a.yearSort - b.yearSort);

export default function Timeline() {
  const [filter, setFilter] = useState<string>("全部");
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(
    () => (filter === "全部" ? sortedEvents : sortedEvents.filter((e) => e.category === filter)),
    [filter]
  );

  const filters = ["全部", "庄子生平", "战国事件", "人物"];

  return (
    <div>
      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 mb-8" role="group" aria-label="按类别筛选事件">
        {filters.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${
              filter === f
                ? "border-[var(--text-accent)] text-[var(--text-accent)] bg-[var(--text-accent)]/10"
                : "border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Timeline */}
      <div className="relative">
        {/* Vertical line */}
        <div aria-hidden="true" className="absolute left-4 sm:left-1/2 top-0 bottom-0 w-0.5 bg-[var(--border-color)] -translate-x-1/2" />

        {/* 2026-08-24 视觉复审：space-y-8 → 4，交错布局本身已有呼吸感，
            原行距把 24 条事件拉到 3000+px */}
        <ol className="space-y-4">
          {filtered.map((event, idx) => {
            const isLeft = idx % 2 === 0;
            const isExpanded = expanded === `${event.year}-${event.event}`;

            return (
              <li
                key={`${event.year}-${event.event}`}
                className={`relative flex items-start gap-4 sm:gap-8 ${
                  isLeft ? "sm:flex-row" : "sm:flex-row-reverse"
                }`}
              >
                {/* Dot */}
                <div aria-hidden="true" className="absolute left-4 sm:left-1/2 w-3 h-3 rounded-full -translate-x-1/2 z-10 border-2 border-white dark:border-[var(--bg-primary)] shadow-sm"
                  style={{ backgroundColor: categoryStyles[event.category]?.dot || "#9ca3af" }}
                />

                {/* Spacer */}
                <div className="hidden sm:block sm:w-1/2" />

                {/* Card */}
                <div className={`ml-8 sm:ml-0 sm:w-1/2 ${isLeft ? "sm:pr-8" : "sm:pl-8"}`}>
                  {/* 原为 div onClick：键盘无法聚焦/展开，读屏也不知道可展开 */}
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    onClick={() => setExpanded(isExpanded ? null : `${event.year}-${event.event}`)}
                    className="block w-full text-left p-3 sm:p-4 rounded-lg border-l-4 cursor-pointer transition-all hover:shadow-sm bg-[var(--bg-card)]"
                    style={{
                      borderLeftColor: categoryStyles[event.category]?.border || "#d1d5db",
                      backgroundColor: categoryStyles[event.category]?.bg || "var(--bg-card)",
                    }}
                  >
                    <span className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-[var(--text-secondary)]">
                        {event.year}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--border-color)] text-[var(--text-secondary)]">
                        {event.category}
                      </span>
                    </span>
                    <span className="block text-sm font-medium text-[var(--text-primary)]">
                      {event.event}
                    </span>
                    {/* 说明始终在 DOM 里（爬虫 / 无 JS 可读），折叠时用 hidden 类收起（不用 hidden 属性：preflight 的分层 !important 规则无法被覆盖）；
                        页面里的 <noscript> 样式会在无 JS 时把它们全部展开 */}
                    <span
                      data-tl-desc=""
                      className={`mt-2 text-xs text-[var(--text-secondary)] leading-relaxed ${isExpanded ? "block" : "hidden"}`}
                    >
                      {event.description}
                    </span>
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
