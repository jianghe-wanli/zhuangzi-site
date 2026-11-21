"use client";

import { useEffect, useRef, useState } from "react";

import { JIAZHU_MODE_KEY, READING_SETTINGS_KEY, readingCssValue } from "@/lib/reading-prefs";
import type { SoundMode, StudyAudioEngine } from "@/lib/study-audio";

const textSettings = [
  { key: "fontSize", label: "字号", values: ["sm", "base", "lg", "xl"], labels: ["小", "中", "大", "特大"] },
  { key: "lineHeight", label: "行距", values: ["1.6", "1.9", "2.2", "2.5"], labels: ["窄", "标准", "宽", "特宽"] },
  { key: "readingWidth", label: "版心", values: ["narrow", "normal", "wide"], labels: ["窄", "标准", "宽"] },
] as const;

export default function ReadingSettings() {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [jiazhuMode, setJiazhuMode] = useState<"standard" | "jiazhu">("standard");
  const [soundMode, setSoundMode] = useState<SoundMode>("none");
  const audioEngineRef = useRef<StudyAudioEngine | null>(null);
  const soundModeRef = useRef<SoundMode>("none");

  // 卸载时停止音效
  useEffect(() => () => audioEngineRef.current?.stop(), []);

  // Escape 关闭（下拉面板的标准键盘行为）
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // 读取 localStorage 同步面板状态。样式本身已由 <head> 内联脚本在首帧前写好
  // （见 @/lib/reading-prefs），这里再应用一次只为兜住脚本被拦截的情况。
  useEffect(() => {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(READING_SETTINGS_KEY) ?? "{}");
      if (parsed && typeof parsed === "object") {
        const valid: Record<string, string> = {};
        for (const [k, v] of Object.entries(parsed)) {
          const css = typeof v === "string" ? readingCssValue(k, v) : undefined;
          if (!css) continue; // 丢弃未知键 / 非法取值，不把任意字符串写进样式
          valid[k] = v as string;
          document.documentElement.style.setProperty(`--reading-${k}`, css);
        }
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setValues(valid);
      }
      if (localStorage.getItem(JIAZHU_MODE_KEY) === "jiazhu") {
        document.documentElement.classList.add("jiazhu-mode");
        setJiazhuMode("jiazhu");
      }
    } catch {
      // 存储不可用 / 内容损坏 → 保持默认排版
    }
  }, []);

  /** 写存储失败（隐私模式 / 配额）不影响本次会话内生效 */
  const persist = (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch {}
  };

  const applyTextSetting = (key: string, val: string) => {
    const css = readingCssValue(key, val);
    if (!css) return;
    const next = { ...values, [key]: val };
    setValues(next);
    document.documentElement.style.setProperty(`--reading-${key}`, css);
    persist(READING_SETTINGS_KEY, JSON.stringify(next));
  };

  const handleJiazhuChange = (mode: "standard" | "jiazhu") => {
    setJiazhuMode(mode);
    document.documentElement.classList.toggle("jiazhu-mode", mode === "jiazhu");
    persist(JIAZHU_MODE_KEY, mode);
  };

  const handleSoundChange = (mode: SoundMode) => {
    setSoundMode(mode);
    soundModeRef.current = mode;
    if (mode === "none") {
      audioEngineRef.current?.stop();
      return;
    }
    const play = (engine: StudyAudioEngine) => {
      // 引擎 chunk 加载期间读者可能已改选 —— 以最新选择为准
      if (soundModeRef.current === "rain") engine.playRain();
      else if (soundModeRef.current === "guqin") engine.playGuqin();
    };
    if (audioEngineRef.current) {
      play(audioEngineRef.current);
      return;
    }
    // 首次选择音效时才加载合成引擎（不进共享 JS）
    void import("@/lib/study-audio")
      .then(({ StudyAudioEngine: Engine }) => {
        audioEngineRef.current ??= new Engine();
        play(audioEngineRef.current);
      })
      .catch(() => {
        soundModeRef.current = "none";
        setSoundMode("none");
      });
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="min-w-[32px] min-h-[32px] flex items-center justify-center p-1.5 rounded hover:bg-[var(--hover-bg)] text-[var(--text-secondary)] hover:text-[var(--text-accent)] transition-colors"
        title="阅读设置"
        aria-label="阅读设置"
        aria-expanded={open}
      >
        <svg className="w-3.5 h-3.5" fill="none" aria-hidden="true" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
        </svg>
      </button>

      {open && (
        <>
          {/* 点击遮罩关闭：装饰性背景，对读屏隐藏（键盘用 Escape） */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute right-0 top-full mt-2 z-50 w-64 p-3.5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-xl animate-fade-in text-[var(--text-primary)]">
            <div className="text-xs font-semibold text-[var(--text-accent)] mb-3 pb-1 border-b border-[var(--border-light)] tracking-[0.06em]">
              阅读与书斋设置
            </div>

            {/* 1. 排版设置 */}
            {textSettings.map((s) => (
              <div key={s.key} className="mb-3">
                <div className="text-[11px] text-[var(--text-secondary)] mb-1 font-medium">{s.label}</div>
                <div className="flex gap-1">
                  {s.values.map((v, i) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => applyTextSetting(s.key, v)}
                      aria-pressed={values[s.key] === v || (!values[s.key] && i === 1)}
                      className={`flex-1 text-xs py-1 rounded transition-colors ${
                        values[s.key] === v || (!values[s.key] && i === 1)
                          ? "bg-[var(--text-accent)]/15 text-[var(--text-accent)] font-medium shadow-xs"
                          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)]"
                      }`}
                    >
                      {s.labels[i]}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {/* 2. 注疏版式（宋刻双行夹注） */}
            <div className="mb-3 pt-2 border-t border-[var(--border-light)]">
              <div className="text-[11px] text-[var(--text-secondary)] mb-1 font-medium">注疏版式</div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => handleJiazhuChange("standard")}
                  aria-pressed={jiazhuMode === "standard"}
                  className={`flex-1 text-xs py-1 rounded transition-colors ${
                    jiazhuMode === "standard"
                      ? "bg-[var(--text-accent)]/15 text-[var(--text-accent)] font-medium shadow-xs"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)]"
                  }`}
                >
                  标准
                </button>
                <button
                  type="button"
                  onClick={() => handleJiazhuChange("jiazhu")}
                  aria-pressed={jiazhuMode === "jiazhu"}
                  className={`flex-1 text-xs py-1 rounded transition-colors ${
                    jiazhuMode === "jiazhu"
                      ? "bg-[var(--text-accent)]/15 text-[var(--text-accent)] font-medium shadow-xs"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)]"
                  }`}
                >
                  双行夹注
                </button>
              </div>
            </div>

            {/* 3. 书斋清音（伴读环境音合成器） */}
            <div className="pt-2 border-t border-[var(--border-light)]">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-[var(--text-secondary)] font-medium">书斋清音</span>
                <span className="text-[10px] text-[var(--text-muted)]">Web Audio</span>
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => handleSoundChange("none")}
                  aria-pressed={soundMode === "none"}
                  className={`flex-1 text-xs py-1 rounded transition-colors ${
                    soundMode === "none"
                      ? "bg-[var(--text-accent)]/15 text-[var(--text-accent)] font-medium shadow-xs"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)]"
                  }`}
                >
                  静音
                </button>
                <button
                  type="button"
                  onClick={() => handleSoundChange("guqin")}
                  aria-pressed={soundMode === "guqin"}
                  className={`flex-1 text-xs py-1 rounded transition-colors ${
                    soundMode === "guqin"
                      ? "bg-[var(--text-accent)]/15 text-[var(--text-accent)] font-medium shadow-xs"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)]"
                  }`}
                >
                  古琴泛音
                </button>
                <button
                  type="button"
                  onClick={() => handleSoundChange("rain")}
                  aria-pressed={soundMode === "rain"}
                  className={`flex-1 text-xs py-1 rounded transition-colors ${
                    soundMode === "rain"
                      ? "bg-[var(--text-accent)]/15 text-[var(--text-accent)] font-medium shadow-xs"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)]"
                  }`}
                >
                  竹林听雨
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
