"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";


export interface Quote {
  id: string;
  text: string;
  chapter: string;
  chapterId: string;
  theme: string;
  explanation: string;
  translation?: string;
}

interface Stats {
  completed: number;
  perfect: number;
  streak: number;
}

const STATS_KEY = "recite_stats";
const HAN = /[\u4E00-\u9FFF]/;

/** Fisher–Yates 洗牌（sort(() => Math.random() - 0.5) 的结果并不均匀） */
function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** 随机选 k 个汉字下标（跳过标点）作为挖空位 */
function pickBlanks(text: string): number[] {
  const hanIdx = Array.from(text)
    .map((c, i) => (HAN.test(c) ? i : -1))
    .filter((i) => i >= 0);
  const k = Math.min(6, Math.max(2, Math.floor(hanIdx.length * 0.3)));
  const shuffled = shuffle(hanIdx);
  return shuffled.slice(0, k).sort((a, b) => a - b);
}

/**
 * 名句背诵 —— 挖空填字练习（对标古诗文网「背诵」功能）。
 *
 * 从 44 条名句中随机取句，按字数挖 2–6 个空，逐空填写后批改；
 * 候选字区展示本句全部汉字（乱序）模拟宋代木活字点选。统计存 localStorage。
 */
export default function ReciteGame({ quotes }: { quotes: Quote[] }) {
  const THEMES = useMemo(() => ["全部", ...new Set(quotes.map((q) => q.theme))], [quotes]);
  const [theme, setTheme] = useState("全部");
  const [queue, setQueue] = useState<string[]>([]);
  const [current, setCurrent] = useState<Quote | null>(null);
  const [blanks, setBlanks] = useState<number[]>([]);
  const [candidates, setCandidates] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [checked, setChecked] = useState(false);
  const [activeBlank, setActiveBlank] = useState<number | null>(null);
  const [stats, setStats] = useState<Stats>({ completed: 0, perfect: 0, streak: 0 });

  const inputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  useEffect(() => {
    // 挂载后读统计（hydration-safe；localStorage 只在客户端存在）
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStats(
        JSON.parse(localStorage.getItem(STATS_KEY) || "null") ?? {
          completed: 0,
          perfect: 0,
          streak: 0,
        }
      );
    } catch {
      setStats({ completed: 0, perfect: 0, streak: 0 });
    }
  }, []);

  const saveStats = (s: Stats) => {
    setStats(s);
    try {
      localStorage.setItem(STATS_KEY, JSON.stringify(s));
    } catch {
      // 存储满 — 忽略
    }
  };

  const startQuote = useCallback((q: Quote) => {
    setCurrent(q);
    const newBlanks = pickBlanks(q.text);
    setBlanks(newBlanks);
    // 候选字乱序随出题一次算好存状态 —— Math.random 不可在渲染期调用
    setCandidates(
      [...new Set(Array.from(q.text).filter((c) => HAN.test(c)))].sort(
        () => Math.random() - 0.5
      )
    );
    setAnswers({});
    setChecked(false);
    setActiveBlank(newBlanks[0] ?? null);
  }, []);

  /** 一格填定：只留最后一个字符，并把焦点移到下一空 */
  const commitBlank = (i: number, raw: string) => {
    const val = Array.from(raw).pop() ?? "";
    setAnswers((a) => ({ ...a, [i]: val }));
    if (!val) return;
    const nextBlank = blanks[blanks.indexOf(i) + 1];
    if (nextBlank !== undefined) {
      setActiveBlank(nextBlank);
      inputRefs.current[nextBlank]?.focus();
    }
  };

  const next = useCallback(() => {
    if (queue.length > 0) {
      const [head, ...rest] = queue;
      const q = quotes.find((x) => x.id === head);
      setQueue(rest);
      if (q) startQuote(q);
      return;
    }
    // 队列耗尽 → 按主题重洗
    const pool = quotes.filter(
      (q) => theme === "全部" || q.theme === theme
    );
    const shuffled = shuffle(pool);
    const first = shuffled.shift();
    setQueue(shuffled.map((q) => q.id));
    if (first) startQuote(first);
  }, [queue, theme, startQuote, quotes]);

  // 首次进入自动出题（changeTheme 置空 current 后亦由此触发重洗）
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!current) next();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  const changeTheme = (t: string) => {
    setTheme(t);
    setQueue([]);
    setCurrent(null);
  };

  const check = () => {
    if (!current) return;
    const filled = blanks.every((i) => (answers[i] ?? "").trim().length > 0);
    if (!filled) return;
    setChecked(true);
    const allCorrect = blanks.every(
      (i) => (answers[i] ?? "").trim() === Array.from(current.text)[i]
    );
    saveStats({
      completed: stats.completed + 1,
      perfect: stats.perfect + (allCorrect ? 1 : 0),
      streak: allCorrect ? stats.streak + 1 : 0,
    });
  };

  // 点击活字字模：自动填入当前聚焦空或首个空格，并推进至下一空
  const handleCandidateClick = (char: string) => {
    if (checked || blanks.length === 0) return;

    let targetIdx: number | undefined;
    if (
      activeBlank !== null &&
      blanks.includes(activeBlank) &&
      !(answers[activeBlank] ?? "").trim()
    ) {
      targetIdx = activeBlank;
    } else {
      targetIdx = blanks.find((b) => !(answers[b] ?? "").trim());
      if (
        targetIdx === undefined &&
        activeBlank !== null &&
        blanks.includes(activeBlank)
      ) {
        targetIdx = activeBlank;
      }
    }
    if (targetIdx === undefined) {
      targetIdx = blanks[0];
    }
    if (targetIdx === undefined) return;

    setAnswers((prev) => ({ ...prev, [targetIdx]: char }));

    const curOrder = blanks.indexOf(targetIdx);
    const nextBlank = blanks[curOrder + 1];
    if (nextBlank !== undefined) {
      setActiveBlank(nextBlank);
      inputRefs.current[nextBlank]?.focus();
    }
  };

  return (
    <>

      {/* 统计条 */}
      <div
        className="flex items-center gap-4 mb-6 text-xs text-[var(--text-muted)]"
        role="status"
      >
        <span>
          已完成 <b className="text-[var(--text-accent)]">{stats.completed}</b> 句
        </span>
        <span className="opacity-30">·</span>
        <span>
          全对 <b className="text-[var(--text-accent)]">{stats.perfect}</b> 句
        </span>
        <span className="opacity-30">·</span>
        <span>
          连对 <b className="text-[var(--text-accent)]">{stats.streak}</b>
        </span>
      </div>

      {/* 主题筛选 */}
      <div className="flex flex-wrap gap-2 mb-6" role="group" aria-label="按主题出题">
        {THEMES.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={theme === t}
            onClick={() => changeTheme(t)}
            className={`px-3 py-1.5 rounded-full text-xs transition-all ${
              theme === t
                ? "bg-[var(--text-accent)] text-[var(--btn-accent-text,#ffffff)] shadow-xs"
                : "border border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--text-accent)]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {current && (
        <div className="card p-6 sm:p-8">
          {/* 出处 */}
          <div className="flex items-center justify-between mb-6">
            <span className="text-xs font-medium text-[var(--text-accent)] tracking-[0.06em]">
              {current.theme} · 《{current.chapter}》
            </span>
            <Link
              href={`/chapters/${current.chapterId}`}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-accent)] transition-colors"
            >
              读原文 ↗
            </Link>
          </div>

          {/* 挖空句 */}
          <div className="text-xl sm:text-2xl leading-[2.2] tracking-[0.08em] text-[var(--text-primary)] font-serif mb-6">
            {Array.from(current.text).map((ch, i) =>
              blanks.includes(i) ? (
                <span key={i} className="inline-block align-middle mx-1">
                  {checked ? (
                    <span
                      className={`inline-flex items-center justify-center min-w-[2.25rem] px-1.5 h-9 rounded-md border text-base font-serif align-middle ${
                        (answers[i] ?? "").trim() === ch
                          ? "border-green-600/50 bg-green-500/10 text-green-700 dark:text-green-400"
                          : "border-[var(--color-accent-vermilion,#b83b2e)]/50 bg-[var(--color-accent-vermilion,#b83b2e)]/10 text-[var(--color-accent-vermilion,#b83b2e)]"
                      }`}
                    >
                      {(answers[i] ?? "").trim() === ch
                        ? ch
                        : `${answers[i] ?? "？"}→${ch}`}
                    </span>
                  ) : (
                    <input
                      ref={(el) => {
                        inputRefs.current[i] = el;
                      }}
                      type="text"
                      value={answers[i] ?? ""}
                      onFocus={() => setActiveBlank(i)}
                      onChange={(e) => {
                        // 拼音输入法组字期间（值是未上屏的拉丁字母）只回显，不截断、不跳格；
                        // 否则敲下第一个字母焦点就跳到下一空，汉字根本输不进去
                        const composing = (e.nativeEvent as InputEvent).isComposing;
                        if (composing) {
                          setAnswers((a) => ({ ...a, [i]: e.target.value }));
                          return;
                        }
                        commitBlank(i, e.target.value);
                      }}
                      onCompositionEnd={(e) => commitBlank(i, e.currentTarget.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.nativeEvent.isComposing) check();
                      }}
                      aria-label={`第${blanks.indexOf(i) + 1}空`}
                      className="w-9 h-9 rounded-md border border-[var(--border-strong)] bg-[var(--bg-secondary)] text-center text-lg font-serif text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--text-accent)]/30 focus:border-[var(--text-accent)]/50 align-middle shadow-xs"
                    />
                  )}
                </span>
              ) : (
                <span key={i}>{ch}</span>
              )
            )}
          </div>

          {/* 候选字提示（活字字模可点击） */}
          {!checked && (
            <div className="mb-6 pb-5 border-b border-[var(--border-light)]">
              <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] font-serif mb-2.5">
                <span className="seal-char" aria-hidden="true">活</span>
                <span>宋代木活字（点击字模一指填入）：</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {candidates.map((c, i) => (
                  <button
                    key={`${c}-${i}`}
                    type="button"
                    onClick={() => handleCandidateClick(c)}
                    className="w-9 h-9 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-card)] shadow-sm hover:-translate-y-0.5 active:translate-y-0 transition-all font-serif text-base text-[var(--text-primary)] hover:border-[var(--text-accent)] hover:text-[var(--text-accent)] flex items-center justify-center cursor-pointer select-none"
                    title={`填入「${c}」`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 批改后展示译文与解读 */}
          {checked && (
            <div className="space-y-3 mb-6 animate-fade-in">
              {current.translation && (
                <div>
                  <h3 className="text-xs font-semibold text-[var(--text-accent)] tracking-[0.08em] mb-1">
                    译文
                  </h3>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                    {current.translation}
                  </p>
                </div>
              )}
              <div>
                <h3 className="text-xs font-semibold text-[var(--text-accent)] tracking-[0.08em] mb-1">
                  解读
                </h3>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  {current.explanation}
                </p>
              </div>
            </div>
          )}

          {/* 操作 */}
          <div className="flex items-center gap-3">
            {!checked ? (
              <button
                onClick={check}
                className="flex-1 py-2.5 rounded-xl bg-[var(--text-accent)] text-[var(--btn-accent-text,#ffffff)] text-sm font-medium hover:opacity-90 transition-opacity shadow-xs"
              >
                检查（Enter）
              </button>
            ) : (
              <button
                onClick={next}
                className="flex-1 py-2.5 rounded-xl bg-[var(--text-accent)] text-[var(--btn-accent-text,#ffffff)] text-sm font-medium hover:opacity-90 transition-opacity shadow-xs"
              >
                下一句 →
              </button>
            )}
          </div>
        </div>
      )}

      <p className="mt-6 text-center text-xs text-[var(--text-muted)]">
        背诵之外还可
        <Link
          href="/translate-challenge"
          className="text-[var(--text-accent)] hover:underline mx-1"
        >
          试译全文
        </Link>
        或
        <Link
          href="/cards"
          className="text-[var(--text-accent)] hover:underline mx-1"
        >
          生成名句卡片
        </Link>
      </p>
    </>
  );
}
