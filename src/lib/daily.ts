/**
 * 「每日一庄」候选池（仅服务端 / 构建期使用：依赖全量篇章数据）。
 *
 * 每篇取一段，共 33 条。首页只把**原文**随 RSC 下发（当日条目要在水合后
 * 下一帧就位，不能等网络）；**译文**只在读者点「查看白话译文」时才需要，
 * 由 /daily-translations.json 按需取回 —— 两者由同一函数派生，下标一一对应。
 * 此前 33 条译文随首页 HTML 下发，占首页 gzip 体积约 15%，绝大多数访问用不到。
 */
import type { DailySnippet } from "@/components/DailyPassage";
import { chapters } from "@/data/chapters";

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);

function pick() {
  return chapters.map((ch, idx) => {
    const pIdx = idx % ch.passages.length;
    return { ch, pIdx, passage: ch.passages[pIdx]! };
  });
}

export function buildDailyPool(): DailySnippet[] {
  return pick().map(({ ch, pIdx, passage }) => ({
    chapterId: ch.id,
    chapterTitle: ch.title,
    passageNum: pIdx + 1,
    original: clip(passage.original, 120),
  }));
}

/** 与 buildDailyPool() 下标对齐的译文数组 */
export function buildDailyTranslations(): string[] {
  return pick().map(({ passage }) => clip(passage.translation, 140));
}
