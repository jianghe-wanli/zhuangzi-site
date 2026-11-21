/**
 * 词语索引的精简派生数据（仅供 server component 使用）。
 *
 * concordance.json 原始 116KB：每条出现位置都重复完整的 chapterId / passageId
 * 字符串。客户端岛只需要「第几篇第几节」，这里在构建期压成数字后经 props 传入，
 * 不要在 "use client" 文件里直接 import concordance.json。
 */
import { chaptersMeta } from "@/data/chapters/metadata";
import concordanceData from "@/data/concordance.json";

import { passageNumberFromId } from "./passage-number";

interface RawWord {
  word: string;
  count: number;
  occurrences: { chapterId: string; passageId: string }[];
}

const rawWords = (concordanceData as { words: RawWord[] }).words;
const chapterIndex = new Map(chaptersMeta.map((m, i) => [m.id, i]));

/** 出现位置编码：篇序号(0-based) * 100 + 节号(1-based)；每篇节数远小于 100 */
export const OCC_BASE = 100;

export interface ConcordanceWord {
  w: string;
  /** 总出现次数 */
  c: number;
  /** 出现位置（编码见 OCC_BASE） */
  o: number[];
}

export const concordanceWords: ConcordanceWord[] = rawWords.map((w) => ({
  w: w.word,
  c: w.count,
  o: w.occurrences.flatMap((o) => {
    const ci = chapterIndex.get(o.chapterId);
    const n = passageNumberFromId(o.chapterId, o.passageId);
    return ci === undefined || n === null ? [] : [ci * OCC_BASE + n];
  }),
}));

export const concordanceWordCount = rawWords.length;

export interface HeatmapRow {
  word: string;
  count: number;
  /** 按篇序排列的出现段落数，长度 = 篇数 */
  perChapter: number[];
}

/** 前 limit 个高频词在各篇的分布 */
export function heatmapRows(limit: number): HeatmapRow[] {
  return rawWords.slice(0, limit).map((w) => {
    const perChapter = new Array<number>(chaptersMeta.length).fill(0);
    for (const o of w.occurrences) {
      const ci = chapterIndex.get(o.chapterId);
      if (ci !== undefined) perChapter[ci] = (perChapter[ci] ?? 0) + 1;
    }
    return { word: w.word, count: w.count, perChapter };
  });
}
