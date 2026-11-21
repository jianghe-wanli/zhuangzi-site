/**
 * 静态块的客户端缓存与取回（浏览器端模块级单例）。
 *
 * 与 StaticBlock 组件分开放：根布局的 StaticBlockPrefetch 只需要这几十行，
 * 不该把整个组件带进全站共享 chunk。
 */

export type Html = { __html: string };
export type Blocks = Record<string, string>;

/** 已知的块内容（水合时从 DOM 采集，或由 blocks.json 取回），键为 `${src}#${id}` */
export const known = new Map<string, Html>();
export const pending = new Map<string, Promise<Blocks>>();

export function fetchBlocks(src: string, init?: RequestInit): Promise<Blocks> {
  return fetch(src, init)
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<Blocks>;
    })
    .then((blocks) => {
      for (const [id, html] of Object.entries(blocks)) known.set(`${src}#${id}`, { __html: html });
      return blocks;
    });
}

/**
 * 预取某页的 blocks.json（悬停 / 触摸 / 聚焦 / 点击链接时由 StaticBlockPrefetch 调用），
 * 让正文与 RSC 载荷并行到达，而不是等 RSC 渲染出 StaticBlock 后才开始取。
 * 失败静默丢弃 —— 真正渲染时会重取。
 */
export function prefetchBlocks(src: string): void {
  if (pending.has(src)) return;
  const p = fetchBlocks(src);
  pending.set(src, p);
  p.catch(() => {
    if (pending.get(src) === p) pending.delete(src);
  });
}

/** 站内路径 → 该页 blocks.json 的路径；不是静态块页面则返回 null */
export function blocksSrcForPath(pathname: string): string | null {
  const m = /^\/(chapters|concepts)(\/[^/]+)?\/?$/.exec(pathname);
  return m ? `/${m[1]}${m[2] ?? ""}/blocks.json` : null;
}
