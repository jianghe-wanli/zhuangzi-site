"use client";

import { type ComponentType, type ReactNode, useEffect, useState } from "react";

/**
 * Leaflet 只在浏览器里按需加载；就绪前渲染 server 直出的 fallback
 * （完整地点名录），无 JS / 加载失败时它就是这页的内容。
 */
export default function MapWrapper({ fallback }: { fallback: ReactNode }) {
  const [MapComp, setMapComp] = useState<ComponentType | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("@/components/ZhuangziMap")
      .then((m) => {
        if (!cancelled) setMapComp(() => m.default);
      })
      .catch(() => {
        /* chunk 取不到（离线等）：保留文字名录 */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return MapComp ? <MapComp /> : fallback;
}
