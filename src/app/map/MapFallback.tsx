import Link from "next/link";

import rawLocations from "@/data/map-locations.json";

interface Loc {
  id: string;
  name: string;
  desc: string;
  chapter: string;
  chapterId: string;
  event: string;
  quote: string;
  state: string;
  year: string;
}

const locations = rawLocations as Loc[];

/**
 * 地图的服务端直出版本：Leaflet 就绪前（以及无 JS、爬虫、读屏场景）的文字替代。
 * 外框尺寸与 ZhuangziMap 的双栏布局一致，交互版接管时不产生布局跳动。
 */
export default function MapFallback() {
  return (
    <div className="w-full">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 xl:col-span-8 rounded-xl border border-[var(--border-color)] overflow-hidden shadow-sm bg-[var(--bg-secondary)]">
          <div
            className="w-full h-[460px] sm:h-[540px] lg:h-[620px] flex items-center justify-center text-sm text-[var(--text-secondary)]"
            role="status"
          >
            加载地图中…
          </div>
        </div>
        <div className="lg:col-span-5 xl:col-span-4">
          <div className="p-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-xs">
            <h2 className="text-xs font-serif! font-medium text-[var(--text-secondary)] mb-3">
              诸侯行迹名录（{locations.length} 处）
            </h2>
            <ul className="space-y-3 lg:max-h-[560px] overflow-y-auto pr-1">
              {locations.map((loc) => (
                <li
                  key={loc.id}
                  className="p-2.5 rounded-lg border border-[var(--border-light)] bg-[var(--bg-secondary)] text-xs font-serif"
                >
                  <h3 className="font-medium text-[var(--text-primary)]">
                    {loc.name}
                    <span className="ml-2 font-normal text-[var(--text-muted)]">
                      {loc.state} · {loc.year}
                    </span>
                  </h3>
                  <p className="mt-1 text-[var(--text-accent)]">{loc.event}</p>
                  {/* 收在 <details> 里：仍在 HTML 中、无 JS 可展开，但不为首屏多拉几片字体 */}
                  <details className="mt-1">
                    <summary className="cursor-pointer text-[var(--text-secondary)]">考释与原文</summary>
                    <p className="mt-1 text-[var(--text-secondary)] leading-relaxed">{loc.desc}</p>
                    <blockquote className="mt-1 text-[var(--text-primary)] italic">“{loc.quote}”</blockquote>
                  </details>
                  <Link
                    href={`/chapters/${loc.chapterId}`}
                    prefetch={false}
                    className="mt-1 inline-block font-semibold text-[var(--text-accent)]"
                  >
                    《庄子 · {loc.chapter}》展卷读原典 →
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
