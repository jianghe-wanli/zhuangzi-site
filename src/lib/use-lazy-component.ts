import { type ComponentType, useCallback, useState } from "react";

/**
 * 交互触发的组件懒加载。
 *
 * 不用 next/dynamic（React.lazy）的原因：chunk 取不到时（离线、部署后旧 chunk 已下线）
 * lazy 会在渲染期抛错，根布局里的岛没有就近的错误边界，整页会被换成错误页；
 * 而且失败结果被 lazy 记住，无法重试。这里失败只是「没打开」，再触发一次即重试。
 *
 * `loader` 必须是模块级常量（稳定引用）。
 */
export function useLazyComponent<P>(
  loader: () => Promise<{ default: ComponentType<P> }>
): [Component: ComponentType<P> | null, load: () => void] {
  const [Component, setComponent] = useState<ComponentType<P> | null>(null);
  const load = useCallback(() => {
    loader().then(
      (mod) => setComponent(() => mod.default),
      () => {}
    );
  }, [loader]);
  return [Component, load];
}
