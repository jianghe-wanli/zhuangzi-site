/**
 * 页内锚点跳转（平滑或瞬时）：html[data-anchor-jump] 期间 .cv-auto 按真实高度排版（见 globals.css）。
 *
 * 离屏段落是 content-visibility:auto，占位高度只是估算值。平滑滚动的终点在起跳时
 * 按估算高度算好，途经的段落渲染出真实高度后目标被越推越远 —— 实测逍遥游
 * 「阅览篇末总结」停在距目标约 3900px 处。起跳前先让全部段落按真实高度排版，
 * 终点才是准的；滚动结束后恢复按需排版（浏览器会记住各段的真实高度）。
 *
 * 调用后须在同一任务内发起滚动（原生锚点跳转或 scrollIntoView）。
 */
const ATTR = "data-anchor-jump";
/** 没有发生滚动（目标已在原位）或浏览器不支持 scrollend 时的兜底 */
const GIVE_UP_MS = 2_500;

let timer = 0;

function endAnchorJump(): void {
  window.clearTimeout(timer);
  window.removeEventListener("scrollend", endAnchorJump);
  document.documentElement.removeAttribute(ATTR);
}

export function beginAnchorJump(): void {
  document.documentElement.setAttribute(ATTR, "");
  window.clearTimeout(timer);
  window.addEventListener("scrollend", endAnchorJump);
  timer = window.setTimeout(endAnchorJump, GIVE_UP_MS);
}
