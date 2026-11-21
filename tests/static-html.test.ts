/**
 * 静态块渲染器（src/lib/static-html.ts）。
 *
 * 1. 单元测试：属性白名单、布尔属性、转义、void 元素等。
 * 2. 一致性断言：全部篇章页 / 概念页的每个静态块，renderStatic 的输出必须与
 *    react-dom/server 的 renderToStaticMarkup **逐字节相同** —— 防止属性被
 *    静默改写成错误名字，或与 React 渲染出的 DOM 结构出现偏差。
 */
import { createElement as h, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const compared: { ours: string; react: string }[] = [];

vi.mock("@/lib/static-html", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/static-html")>();
  return {
    ...actual,
    renderStatic: (node: Parameters<typeof actual.renderStatic>[0]) => {
      const ours = actual.renderStatic(node);
      compared.push({ ours, react: renderToStaticMarkup(h(Fragment, null, node)) });
      return ours;
    },
  };
});

const { renderStatic, internalHref, jsonLdString } =
  await vi.importActual<typeof import("@/lib/static-html")>("@/lib/static-html");

const same = (node: Parameters<typeof renderStatic>[0]) => {
  const ours = renderStatic(node);
  expect(ours).toBe(renderToStaticMarkup(h(Fragment, null, node)));
  return ours;
};

describe("renderStatic", () => {
  it("文本与属性转义同 React", () => {
    expect(same(h("p", { title: `a"b'c<d>&` }, `x<y> & "q" 'z'`))).toBe(
      `<p title="a&quot;b&#x27;c&lt;d&gt;&amp;">x&lt;y&gt; &amp; &quot;q&quot; &#x27;z&#x27;</p>`
    );
  });

  it("null / boolean 子节点不输出，数字照常输出", () => {
    expect(same(h("span", null, null, false, true, 0, "a", 12))).toBe("<span>0a12</span>");
  });

  it("className / htmlFor / tabIndex / colSpan / dateTime / srcSet 映射", () => {
    expect(same(h("label", { className: "c", htmlFor: "x", tabIndex: 0 }))).toBe('<label class="c" for="x" tabindex="0"></label>');
    expect(same(h("td", { colSpan: 2, rowSpan: 3 }))).toBe('<td colSpan="2" rowSpan="3"></td>');
    expect(same(h("time", { dateTime: "2026-01-01" }))).toBe('<time dateTime="2026-01-01"></time>');
    // React 会为 <img srcSet> 额外提升一个 preload <link>，这里只比对元素本身
    expect(renderStatic(h("img", { srcSet: "a.png 2x", alt: "" }))).toBe('<img srcSet="a.png 2x" alt=""/>');
  });

  it("SVG 驼峰属性：连字符化，viewBox 保留大小写", () => {
    expect(
      same(
        h("svg", { viewBox: "0 0 24 24", strokeWidth: 1.5, fill: "none" }, h("path", { strokeLinecap: "round", strokeLinejoin: "round", fillRule: "evenodd", d: "M0 0" }))
      )
    ).toBe('<svg viewBox="0 0 24 24" stroke-width="1.5" fill="none"><path stroke-linecap="round" stroke-linejoin="round" fill-rule="evenodd" d="M0 0"></path></svg>');
    expect(same(h("use", { xlinkHref: "#a" }))).toBe('<use xlink:href="#a"></use>');
  });

  it("布尔属性：true 输出空值，false 省略", () => {
    expect(same(h("details", { open: true }))).toBe('<details open=""></details>');
    expect(same(h("button", { disabled: false, hidden: true }))).toBe('<button hidden=""></button>');
  });

  it("aria-* / data-*：布尔值输出为字符串", () => {
    expect(same(h("button", { "aria-expanded": false, "aria-hidden": true, "data-x": "1", "aria-label": "a — b" }))).toBe(
      '<button aria-expanded="false" aria-hidden="true" data-x="1" aria-label="a — b"></button>'
    );
  });

  it("void 元素自闭合", () => {
    expect(same(h("p", null, "a", h("br"), "b"))).toBe("<p>a<br/>b</p>");
  });

  it("dangerouslySetInnerHTML 原样输出", () => {
    expect(same(h("p", { dangerouslySetInnerHTML: { __html: "<strong>x</strong>&amp;" } }))).toBe("<p><strong>x</strong>&amp;</p>");
  });

  it("函数组件与 Fragment 展开", () => {
    const C = ({ n }: { n: number }) => h(Fragment, null, h("i", null, n), [h("b", { key: 1 }, "x")]);
    expect(same(h("div", null, h(C, { n: 3 })))).toBe("<div><i>3</i><b>x</b></div>");
  });

  it("拒绝无法静态输出的内容（构建失败而非静默出错）", () => {
    expect(() => renderStatic(h("div", { style: { color: "red" } }))).toThrow(/style/);
    expect(() => renderStatic(h("button", { onClick: () => {} }))).toThrow(/onClick/);
    expect(() => renderStatic(h("div", { someUnknownProp: "x" }))).toThrow(/白名单/);
    expect(() => renderStatic(h("div", { draggable: true }))).toThrow(/布尔/);
    expect(() => renderStatic(h(async () => null))).toThrow(/异步/);
    const clientRef = Object.assign(() => null, { $$typeof: Symbol.for("react.client.reference") });
    expect(() => renderStatic(h(clientRef))).toThrow(/客户端组件/);
  });
});

describe("internalHref / jsonLdString", () => {
  it("补尾斜杠并保留 hash", () => {
    expect(internalHref("/concepts")).toBe("/concepts/");
    expect(internalHref("/chapters/01-xiaoyao-you#passage-1")).toBe("/chapters/01-xiaoyao-you/#passage-1");
    expect(internalHref("/quotes/#q1")).toBe("/quotes/#q1");
  });
  it("JSON-LD 不会被 </script> 截断", () => {
    const s = jsonLdString({ a: "</script><script>alert(1)" });
    expect(s).not.toContain("<");
    expect(JSON.parse(s)).toEqual({ a: "</script><script>alert(1)" });
  });
});

describe("静态块输出与 React 渲染逐字节一致", () => {
  it("全部篇章页", async () => {
    const { chapters } = await import("@/data/chapters");
    const { chapterBlocks } = await import("@/app/chapters/[id]/blocks");
    compared.length = 0;
    for (const ch of chapters) {
      const blocks = chapterBlocks(ch);
      expect(blocks.head).toContain("<h1");
      expect(blocks[`${ch.passages[0]!.id}-o`]).toContain("original-text");
    }
    expect(compared.length).toBeGreaterThan(chapters.length * 4);
    for (const c of compared) expect(c.ours).toBe(c.react);
  });

  it("全部概念页", async () => {
    const { concepts } = await import("@/data/concepts");
    const { conceptBlocks } = await import("@/app/concepts/[id]/blocks");
    compared.length = 0;
    for (const c of concepts) expect(conceptBlocks(c).body).toContain("<h1");
    expect(compared.length).toBe(concepts.length);
    for (const c of compared) expect(c.ours).toBe(c.react);
  });
});
