/**
 * 篇章页各客户端岛共用的 DOM 观察器（浏览器端，模块级单例）。
 *
 * 此前每个岛各建一份：ChapterTOC / RecordReading / ScholarMarginNotes 各一个
 * IntersectionObserver 观察同一批段落；每段的工具条（×2）与拼音槽位各一个
 * MutationObserver 观察同一个段落根节点。现在全页各只有一个。
 */

type PassageListener = (el: HTMLElement) => void;

let spy: IntersectionObserver | null = null;
let spied: HTMLElement[] = [];
let current: HTMLElement | null = null;
const spyListeners = new Set<PassageListener>();

function startSpy() {
  spy?.disconnect();
  current = null;
  spied = Array.from(document.querySelectorAll<HTMLElement>('[id^="passage-"]'));
  spy = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        current = entry.target as HTMLElement;
        for (const fn of spyListeners) fn(current);
      }
    },
    // 视口上方 20%–40% 的带状区域：段落进入该区域即视为「正在读」
    { rootMargin: "-20% 0px -60% 0px", threshold: 0 }
  );
  for (const el of spied) spy.observe(el);
}

/**
 * 订阅「当前阅读到的段落」（元素 id 形如 passage-<段落 id>）。
 * 必须在段落 DOM 就位后调用（各岛的 effect 里）。返回取消订阅函数。
 */
export function subscribeCurrentPassage(fn: PassageListener): () => void {
  // 首个订阅者，或上一篇的段落已被卸载（客户端换篇）→ 重新建立
  if (!spy || !spied[0]?.isConnected) startSpy();
  spyListeners.add(fn);
  if (current?.isConnected) fn(current);
  return () => {
    spyListeners.delete(fn);
    if (spyListeners.size === 0) {
      spy?.disconnect();
      spy = null;
      spied = [];
      current = null;
    }
  };
}

type ClassListener = (root: Element) => void;

let classObserver: MutationObserver | null = null;
const classListeners = new Map<Element, Set<ClassListener>>();

/**
 * 订阅某个段落根节点（[data-passage-root]）的 class 变化 ——
 * 分栏 / 拼音 / 批注的显示状态都靠在它上面切换 CSS 类实现。
 */
export function subscribePassageClass(root: Element, fn: ClassListener): () => void {
  classObserver ??= new MutationObserver((records) => {
    const seen = new Set<Node>();
    for (const r of records) {
      if (seen.has(r.target)) continue;
      seen.add(r.target);
      const fns = classListeners.get(r.target as Element);
      if (fns) for (const f of fns) f(r.target as Element);
    }
  });
  let fns = classListeners.get(root);
  if (!fns) {
    fns = new Set();
    classListeners.set(root, fns);
    classObserver.observe(root, { attributes: true, attributeFilter: ["class"] });
  }
  fns.add(fn);
  return () => {
    const set = classListeners.get(root);
    if (!set) return;
    set.delete(fn);
    if (set.size > 0) return;
    classListeners.delete(root);
    // MutationObserver 不能单独取消一个目标：全部断开后把仍有订阅者的重新挂上
    classObserver?.disconnect();
    if (classListeners.size === 0) classObserver = null;
    else for (const el of classListeners.keys()) classObserver?.observe(el, { attributes: true, attributeFilter: ["class"] });
  };
}
