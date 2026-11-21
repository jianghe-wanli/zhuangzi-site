import { useCallback, useEffect, useRef } from "react";

/**
 * 给一次网络请求发放 AbortSignal：新请求会取消上一次，组件卸载时取消，
 * 超过 timeoutMs 自动取消（AI 接口偶发挂起，否则按钮会一直停在「思考中」）。
 */
export function useAbortable(timeoutMs = 60_000): () => AbortSignal {
  const ref = useRef<AbortController | null>(null);

  useEffect(() => () => ref.current?.abort(), []);

  return useCallback(() => {
    ref.current?.abort();
    const controller = new AbortController();
    ref.current = controller;
    const timer = setTimeout(
      () => controller.abort(new DOMException("请求超时，请稍后再试", "TimeoutError")),
      timeoutMs
    );
    controller.signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
    return controller.signal;
  }, [timeoutMs]);
}
