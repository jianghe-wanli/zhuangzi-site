/**
 * 「静态块」服务端侧：把纯静态 JSX 渲染成 HTML 字符串并登记，供
 * `StaticBlock` 客户端岛在 SSR 阶段直出。
 *
 * 为什么需要：静态导出下，server component 的渲染结果既写进 HTML，
 * 又完整序列化进内联 RSC 载荷（self.__next_f.push）——正文在每个页面里
 * 传了两遍（章节页/概念页 HTML 的 45–55%）。把正文交给 StaticBlock 后，
 * RSC 载荷里只剩 `{src,id}` 两个标量，HTML 里的正文由 SSR 直出、
 * 水合时原样保留；客户端路由进入页面时再按需取同目录的 blocks.json。
 *
 * ⚠️ 仅限服务端（RSC 层 / route handler）使用。
 */
import "server-only";

import { Fragment, type ReactNode } from "react";

/** SSR 阶段 StaticBlock 读取的登记表键（RSC 层与 SSR 层同进程、共享 globalThis） */
export const STATIC_BLOCKS_KEY = Symbol.for("zhuangzi.static-blocks");

type Registry = Map<string, string>;

function registry(): Registry {
  const g = globalThis as unknown as Record<symbol, Registry | undefined>;
  return (g[STATIC_BLOCKS_KEY] ??= new Map());
}

/** 登记一页的全部静态块（src 为该页 blocks.json 的站内路径，兼作命名空间） */
export function registerStaticBlocks(src: string, blocks: Record<string, string>): void {
  const reg = registry();
  for (const [id, html] of Object.entries(blocks)) reg.set(`${src}#${id}`, html);
}

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

/**
 * JSX 属性名 → HTML 属性名（白名单）。
 * 输出名与 react-dom/server 逐字节一致（HTML 属性名大小写不敏感，故 colSpan 等保留驼峰；
 * SVG 属性大小写敏感，按 React 的写法连字符化）。
 * 不在表内的驼峰属性一律构建失败 —— 绝不静默小写化成错误名字
 * （tabIndex→tabindex 恰好正确，但 xlinkHref→xlinkhref、strokeWidth→strokewidth 是错的）。
 */
const ATTR: Record<string, string> = {
  className: "class",
  htmlFor: "for",
  tabIndex: "tabindex",
  colSpan: "colSpan",
  rowSpan: "rowSpan",
  dateTime: "dateTime",
  srcSet: "srcSet",
  crossOrigin: "crossorigin",
  referrerPolicy: "referrerPolicy",
  autoComplete: "autoComplete",
  maxLength: "maxLength",
  readOnly: "readOnly",
  noValidate: "noValidate",
  hrefLang: "hrefLang",
  // SVG：连字符化
  strokeWidth: "stroke-width",
  strokeLinecap: "stroke-linecap",
  strokeLinejoin: "stroke-linejoin",
  strokeDasharray: "stroke-dasharray",
  strokeDashoffset: "stroke-dashoffset",
  strokeOpacity: "stroke-opacity",
  fillOpacity: "fill-opacity",
  fillRule: "fill-rule",
  clipRule: "clip-rule",
  clipPath: "clip-path",
  xlinkHref: "xlink:href",
  // SVG：本身就是驼峰，原样保留
  viewBox: "viewBox",
  preserveAspectRatio: "preserveAspectRatio",
};

/** 布尔属性：true 输出 `attr=""`，false 省略（与 React 一致） */
const BOOLEAN = new Set(["hidden", "open", "disabled", "checked", "selected", "readOnly", "required", "multiple", "noValidate", "reversed", "defer", "async", "inert"]);

/** 只影响 React 自身行为、不产生 HTML 属性的 props */
const SKIP = new Set(["children", "key", "ref", "suppressHydrationWarning", "suppressContentEditableWarning"]);

/** 转义规则与 react-dom/server 完全一致（tests/static-html.test.ts 逐页比对两者输出） */
const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;" };

export function escapeText(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

interface ElementLike {
  $$typeof: symbol;
  type: unknown;
  props: Record<string, unknown>;
}

function isElement(node: unknown): node is ElementLike {
  return typeof node === "object" && node !== null && "$$typeof" in node && "props" in node;
}

/**
 * 极简静态渲染器：宿主元素、Fragment、同步函数组件、文本。
 * 刻意不支持客户端组件 / 异步组件 / 事件处理器 —— 遇到即抛错（构建失败），
 * 保证进入静态块的内容确实不需要水合。
 * 不引 react-dom/server：Next 禁止在 RSC 层 import 它。
 */
export function renderStatic(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string") return escapeText(node);
  if (typeof node === "number" || typeof node === "bigint") return String(node);
  if (Array.isArray(node)) return node.map((n) => renderStatic(n as ReactNode)).join("");
  if (!isElement(node)) throw new Error("[static-html] 不支持的节点类型");

  const { type, props } = node;
  if (type === Fragment) return renderStatic(props.children as ReactNode);
  if (typeof type === "function") {
    if ((type as { $$typeof?: symbol }).$$typeof === Symbol.for("react.client.reference")) {
      throw new Error("[static-html] 静态块内不能包含客户端组件");
    }
    const out = (type as (p: unknown) => unknown)(props);
    if (out instanceof Promise) throw new Error("[static-html] 静态块内不能包含异步组件");
    return renderStatic(out as ReactNode);
  }
  if (typeof type !== "string") throw new Error("[static-html] 静态块内不能包含客户端组件");

  let attrs = "";
  let inner: string | null = null;
  for (const [name, value] of Object.entries(props)) {
    if (SKIP.has(name) || value === null || value === undefined) continue;
    if (name === "dangerouslySetInnerHTML") {
      inner = (value as { __html: string }).__html;
      continue;
    }
    if (typeof value === "function" || typeof value === "object" || typeof value === "symbol") {
      throw new Error(`[static-html] <${type}> 的属性 ${name} 无法静态输出`);
    }
    // aria-* / data-*：布尔值按字符串输出（aria-expanded={false} → "false"）
    if (name.startsWith("aria-") || name.startsWith("data-")) {
      attrs += ` ${name}="${escapeText(String(value))}"`;
      continue;
    }
    const attr = ATTR[name] ?? name;
    if (!(name in ATTR) && /[A-Z]/.test(name)) {
      throw new Error(`[static-html] <${type}> 的属性 ${name} 不在白名单内（见 ATTR）`);
    }
    if (typeof value === "boolean") {
      if (!BOOLEAN.has(name)) throw new Error(`[static-html] <${type}> 的属性 ${name} 不是已知布尔属性`);
      if (value) attrs += ` ${attr}=""`;
      continue;
    }
    attrs += ` ${attr}="${escapeText(String(value))}"`;
  }
  if (VOID.has(type)) return `<${type}${attrs}/>`;
  return `<${type}${attrs}>${inner ?? renderStatic(props.children as ReactNode)}</${type}>`;
}

/** 站内链接统一带尾斜杠（与 next/link 在 trailingSlash 下的输出一致） */
export function internalHref(path: string): string {
  const [base = "", hash] = path.split("#");
  const withSlash = base.endsWith("/") ? base : `${base}/`;
  return hash ? `${withSlash}#${hash}` : withSlash;
}

/** 内联 <script type="application/ld+json"> 的安全序列化（防 </script> 截断） */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
