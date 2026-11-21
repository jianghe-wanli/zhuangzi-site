"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

import { subscribePassageClass } from "@/lib/passage-dom";

const PinyinAnnotator = dynamic(() => import("./PinyinAnnotator"), {
  ssr: false,
  loading: () => null,
});

/**
 * 拼音版原文槽位（独立客户端岛）。
 *
 * 默认隐藏；当所在段落 [data-passage-root] 被切到 .pinyin-on 时才挂载
 * PinyinAnnotator —— pinyin-pro chunk 只在用户首次打开拼音时加载，
 * 不占首屏。激活状态用 MutationObserver 观察根节点 class 变化获得，
 * 不与工具条共享 React 状态（跨组件状态会要求 client 祖先包裹正文，
 * 重新引入 RSC 重复载荷）。
 *
 * 原文文本不通过 props 传入（那会让原文被序列化第二遍）：激活时直接从
 * 服务端直出的 .annotated-original 取 textContent。
 */
export default function PinyinSlot() {
  const [on, setOn] = useState(false);
  const [text, setText] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current?.closest("[data-passage-root]");
    if (!root) return;
    let captured = "";
    const update = () => {
      const next = root.classList.contains("pinyin-on");
      if (next && !captured) {
        const el = root.querySelector(".annotated-original .original-text");
        captured = el?.textContent ?? "";
        setText(captured);
      }
      setOn(next);
    };
    update();
    return subscribePassageClass(root, update);
  }, []);

  return (
    <div ref={ref} className="pinyin-original reading-prose tracking-wide text-lg sm:text-xl" hidden={!on}>
      {on && <PinyinAnnotator text={text} enabled={true} />}
    </div>
  );
}
