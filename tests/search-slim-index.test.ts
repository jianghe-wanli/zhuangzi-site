/**
 * 搜索的两条数据路径必须给出同样的结果：
 *   A. 精简索引 public/data/search-index.json（生产默认，scripts/gen-lazy-data.mjs 生成）
 *   B. 全量篇章数据（索引取不到时的回退）
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { chapters } from "@/data/chapters";
import { fullToItems, matchItems, type SlimChapter, slimToItems } from "@/lib/search";

/** 与 scripts/gen-lazy-data.mjs 中 searchIndex 的构建保持一致 */
const slim: SlimChapter[] = chapters.map((ch) => ({
  id: ch.id,
  title: ch.title,
  category: ch.category,
  passages: ch.passages.map((p) => ({
    id: p.id,
    o: p.original,
    t: p.translation,
    ...(p.concepts?.length ? { c: p.concepts } : {}),
  })),
}));

const QUERIES = [
  "逍遥",
  "北冥有鱼",
  "庖丁解牛",
  "庄周梦为胡蝶",
  "天地与我并生",
  "道",
  "无用之用",
  "子非鱼，安知鱼之乐",
  "相濡以沫",
  "不存在的词组甲乙丙",
];

/** 结果卡片与筛选实际用到的字段：排序（数组顺序 + score）、定位（篇 / 节）、片段来源（原文 / 译文） */
const visible = (items: ReturnType<typeof matchItems>) =>
  items.map((r) => ({
    chapterId: r.item.chapterId,
    chapterTitle: r.item.chapterTitle,
    chapterCategory: r.item.chapterCategory,
    passageId: r.item.passageId,
    concepts: r.item.concepts,
    score: r.score,
    original: r.item.original,
    translation: r.item.translation,
  }));

describe("搜索：精简索引与全量回退一致", () => {
  const slimItems = slimToItems(slim);
  const fullItems = fullToItems(chapters);

  it("两条路径的条目数相同", () => {
    expect(slimItems.length).toBe(fullItems.length);
    expect(slimItems.length).toBeGreaterThan(100);
  });

  it.each(QUERIES)("查询「%s」排序、定位与片段一致", (q) => {
    expect(visible(matchItems(slimItems, q))).toEqual(visible(matchItems(fullItems, q)));
  });

  it("代表性查询确有命中（防止两边同时为空而假通过）", () => {
    expect(matchItems(slimItems, "逍遥").length).toBeGreaterThan(0);
    expect(matchItems(slimItems, "北冥有鱼")[0]?.item.passageId).toBe("01-xiaoyao-you-1");
  });

  it("已生成的 search-index.json 与当前篇章数据同步", () => {
    const file = join(process.cwd(), "public", "data", "search-index.json");
    if (!existsSync(file)) return; // 构建产物，未构建时跳过
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(slim);
  });
});

describe("搜索：索引加载路径", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("索引可取时只用精简索引", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(slim), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { search } = await import("@/lib/search");
    const r = await search("北冥有鱼");
    expect(fetchMock).toHaveBeenCalledWith("/data/search-index.json");
    expect(r[0]?.chapterId).toBe("01-xiaoyao-you");
  });

  it.each([
    ["网络错误（离线）", async () => Promise.reject(new TypeError("Failed to fetch"))],
    ["404", async () => new Response("not found", { status: 404 })],
    ["返回的不是 JSON", async () => new Response("<html>", { status: 200 })],
  ])("索引%s时回退到全量数据并给出相同结果", async (_name, impl) => {
    vi.stubGlobal("fetch", vi.fn(impl));
    const { search } = await import("@/lib/search");
    const r = await search("北冥有鱼");
    const expected = visible(matchItems(fullToItems(chapters), "北冥有鱼")).slice(0, 50);
    expect(r.length).toBeGreaterThan(0);
    expect(r.map((x) => [x.chapterId, x.passageId, x.score, x.original, x.translation])).toEqual(
      expected.map((x) => [x.chapterId, x.passageId, x.score, x.original, x.translation])
    );
  });
});
