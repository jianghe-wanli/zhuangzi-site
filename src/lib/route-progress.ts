/**
 * 客户端路由进行中的标记：html[data-navigating] 驱动 globals.css 里的顶部细进度条。
 *
 * 取代原先的根级 loading.tsx 骨架：那个 Suspense 边界会让每个预渲染页面的正文
 * 落进 <div hidden id="S:0">，要等内联脚本执行才换入 —— 禁用 JS 时全站只剩骨架，
 * 每页还多出约 5 KB HTML 与 2 个内联脚本。
 */
const ATTR = "data-navigating";
/** 导航被取消 / 失败时的兜底：超过这个时间仍未换页就收起进度条 */
const GIVE_UP_MS = 10_000;

let timer = 0;

export function markNavigating(): void {
  document.documentElement.setAttribute(ATTR, "");
  window.clearTimeout(timer);
  timer = window.setTimeout(clearNavigating, GIVE_UP_MS);
}

export function clearNavigating(): void {
  window.clearTimeout(timer);
  document.documentElement.removeAttribute(ATTR);
}
