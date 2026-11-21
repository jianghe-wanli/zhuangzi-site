"use client";

import { useLayoutEffect, useRef, useState } from "react";

export interface FilterOption {
  value: string;
  /** 该选项下的条目数（server 端算好，客户端不持有列表数据） */
  count: number;
}

/**
 * 「筛选按钮 + server 直出列表」的叶子客户端岛。
 *
 * 列表卡片由 server component 渲染后经 children 传入（不进任何 JS bundle、
 * 不参与水合），每个直接子元素用 `data-keys="a b"`（空格分隔）声明自己所属的
 * 筛选项。本组件只持有「当前选中项」这一个状态，切换时给不匹配的子元素加
 * `hidden`，不重渲染列表。
 */
export default function FilterableList({
  options,
  allLabel = "全部",
  total,
  countTemplate,
  groupLabel,
  barClassName,
  buttonClassName,
  activeClassName,
  inactiveClassName,
  countClassName,
  listClassName,
  children,
}: {
  options: FilterOption[];
  allLabel?: string;
  total: number;
  /** 计数文案模板，`{n}` 替换为当前筛选后的条数，`{total}` 为总数 */
  countTemplate: string;
  groupLabel: string;
  barClassName: string;
  buttonClassName: string;
  activeClassName: string;
  inactiveClassName: string;
  countClassName: string;
  listClassName: string;
  children: React.ReactNode;
}) {
  const [active, setActive] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    for (const el of Array.from(list.children) as HTMLElement[]) {
      const keys = (el.dataset.keys ?? "").split(" ");
      el.hidden = active !== null && !keys.includes(active);
    }
  }, [active]);

  const shown = active === null ? total : options.find((o) => o.value === active)?.count ?? 0;

  return (
    <>
      <div role="group" aria-label={groupLabel} className={barClassName}>
        {[null, ...options.map((o) => o.value)].map((v) => (
          <button
            key={v ?? "__all"}
            type="button"
            aria-pressed={active === v}
            onClick={() => setActive(v)}
            className={`${buttonClassName} ${active === v ? activeClassName : inactiveClassName}`}
          >
            {v ?? allLabel}
          </button>
        ))}
      </div>

      <p className={countClassName} role="status">
        {countTemplate.replace("{n}", String(shown)).replace("{total}", String(total))}
      </p>

      <div ref={listRef} className={listClassName}>
        {children}
      </div>
    </>
  );
}
