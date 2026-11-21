export interface SearchResult {
  chapterId: string;
  chapterTitle: string;
  chapterCategory: string;
  passageId: string;
  original: string;
  translation: string;
  commentary: string;
  matchField: string;
  score: number;
}

// ——— Lazy-init cache: only build when first search is triggered ———
export interface SearchItem {
  chapterId: string;
  chapterTitle: string;
  chapterCategory: string;
  passageId: string;
  index: number;
  original: string;
  translation: string;
  commentary: string;
  concepts: string[];
  searchText: string;
}

let _searchIndex: SearchItem[] | null = null;
let _indexPromise: Promise<SearchItem[]> | null = null;

/** public/data/search-index.json 的结构（scripts/gen-lazy-data.mjs 构建期生成） */
export interface SlimChapter {
  id: string;
  title: string;
  category: string;
  passages: { id: string; o: string; t: string; c?: string[] }[];
}

interface FullChapter {
  id: string;
  title: string;
  category: string;
  passages: {
    id: string;
    original: string;
    translation: string;
    commentary?: string;
    concepts?: string[];
  }[];
}

/** 精简索引 → 检索条目（不带注疏：搜索只匹配原文，结果卡片也不展示注疏） */
export function slimToItems(data: SlimChapter[]): SearchItem[] {
  return data.flatMap((ch) =>
    ch.passages.map((p, i) => ({
      chapterId: ch.id,
      chapterTitle: ch.title,
      chapterCategory: ch.category,
      passageId: p.id,
      index: i,
      original: p.o,
      translation: p.t,
      commentary: "",
      concepts: p.c ?? [],
      searchText: p.o,
    }))
  );
}

/** 全量篇章数据 → 检索条目 */
export function fullToItems(chapters: FullChapter[]): SearchItem[] {
  return chapters.flatMap((ch) =>
    ch.passages.map((p, i) => ({
      chapterId: ch.id,
      chapterTitle: ch.title,
      chapterCategory: ch.category,
      passageId: p.id,
      index: i,
      original: p.original,
      translation: p.translation,
      commentary: p.commentary || "",
      concepts: p.concepts || [],
      // 只索引原文：搜索命中正文本身，译文/注疏不参与匹配
      // （结果卡片仍展示对应译文，方便对照阅读）
      searchText: p.original,
    }))
  );
}

async function loadSlimIndex(): Promise<SearchItem[]> {
  const res = await fetch("/data/search-index.json");
  if (!res.ok) throw new Error(`search index ${res.status}`);
  return slimToItems((await res.json()) as SlimChapter[]);
}

/** 兜底：索引文件不可用（离线未缓存、未跑过构建的 dev 环境）时退回打包的全量篇章数据 */
async function loadFullIndex(): Promise<SearchItem[]> {
  const { chapters } = await import("@/data/chapters");
  return fullToItems(chapters);
}

async function ensureIndex(): Promise<{ searchIndex: SearchItem[] }> {
  if (_searchIndex) return { searchIndex: _searchIndex };
  // 首次搜索才加载；优先取精简索引（仅原文+译文，约为全量篇章数据的 1/6）
  _indexPromise ??= loadSlimIndex().catch(loadFullIndex);
  try {
    _searchIndex = await _indexPromise;
  } finally {
    _indexPromise = null;
  }
  return { searchIndex: _searchIndex };
}

/**
 * 查询 → 双字 gram 序列（去除标点与空白）。
 * 中文检索按「双字共现」匹配，比单字命中精准、比整串包含宽容。
 */
export function buildGrams(query: string): string[] {
  const clean = query.replace(/[\s\u3000，。、；：！？·—…""''“”‘’〈〉《》「」『』（）【】]/g, "");
  const grams: string[] = [];
  for (let i = 0; i < clean.length - 1; i++) {
    const g = clean.slice(i, i + 2);
    if (!grams.includes(g)) grams.push(g);
  }
  return grams;
}

/** 命中位置加分：越靠前分越高 */
function positionBonus(text: string, s: string): number {
  const idx = text.indexOf(s);
  return idx < 0 ? 0 : Math.max(0, 100 - Math.floor(idx / 50));
}

/**
 * 核心匹配（纯函数，可测试）：
 *  - 单字/双字查询：直接子串包含（fuse.js 对中文单字召回差的历史问题）
 *  - 三字及以上：要求每个双字 gram 都出现（AND 共现），按命中位置评分
 *  - 完整查询串连续命中者大幅加分（精确匹配优先）
 * 注：searchText 只含原文（见 ensureIndex），匹配天然限定在原文域。
 */
export function matchItems(
  items: SearchItem[],
  query: string
): { item: SearchItem; score: number }[] {
  const q = query.trim();
  if (!q) return [];
  const grams = buildGrams(q);
  const out: { item: SearchItem; score: number }[] = [];

  for (const item of items) {
    const text = item.searchText;

    // 无 gram（单字查询）：直接包含
    if (grams.length === 0) {
      if (text.includes(q)) {
        out.push({ item, score: 100 + positionBonus(text, q) });
      }
      continue;
    }

    // 多字查询：AND 共现 + 评分
    let score = 0;
    let all = true;
    for (const g of grams) {
      const idx = text.indexOf(g);
      if (idx < 0) {
        all = false;
        break;
      }
      score += positionBonus(text, g);
    }
    if (!all) continue;
    // 完整查询串连续命中：精确匹配优先
    if (text.includes(q)) score += 200;
    out.push({ item, score });
  }

  return out.sort((a, b) => b.score - a.score);
}

export interface SearchFilters {
  category?: string;
  concept?: string;
}

export async function search(
  query: string,
  filters?: SearchFilters
): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  const { searchIndex } = await ensureIndex();

  let results = matchItems(searchIndex, query);

  // Apply filters
  if (filters) {
    if (filters.category) {
      results = results.filter((r) => r.item.chapterCategory === filters.category);
    }
    if (filters.concept) {
      results = results.filter((r) => filters.concept && r.item.concepts.includes(filters.concept));
    }
  }

  return results.slice(0, 50).map((r) => {
    const item = r.item;
    return {
      chapterId: item.chapterId,
      chapterTitle: item.chapterTitle,
      chapterCategory: item.chapterCategory,
      passageId: item.passageId,
      original: item.original,
      translation: item.translation,
      commentary: item.commentary,
      // 搜索范围已收窄为原文，命中域恒为 original
      matchField: "original",
      score: r.score,
    };
  });
}
