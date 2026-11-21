"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { isBookmarked, toggleBookmark } from "@/lib/annotations";
import { toggleImmersive, useImmersive } from "@/lib/immersive";
import { subscribePassageClass } from "@/lib/passage-dom";

interface PassageToolbarProps {
  chapterId: string;
  passageId: string;
  /** 篇名（收藏列表展示用；缺省回退 chapterId） */
  chapterTitle?: string | undefined;
  /** 段落序号（从 1 开始；复制带出处引用时用） */
  passageNum?: number | undefined;
}

/**
 * 工具条图标：引用篇首静态块里的 SVG sprite（<symbol id="tb-…">，见 PASSAGE_TOOLBAR_SPRITE）。
 * 原先每个按钮内联一份完整 path，每段 7 个、逍遥游一篇 56 份，约 20 KB HTML。
 */
function Icon({ name, className, fill, strokeWidth }: { name: string; className: string; fill: string; strokeWidth: number }) {
  return (
    <svg className={className} fill={fill} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={strokeWidth} aria-hidden="true">
      <use href={`#tb-${name}`} />
    </svg>
  );
}

/**
 * 从所在段落的服务端直出原文读取纯文本（收藏/复制/朗读用）。
 * 不通过 props 传原文 —— 那会让原文被序列化第二遍进 RSC 载荷。
 */
function getOriginalFromDom(el: HTMLElement): string {
  const root = el.closest("[data-passage-root]");
  return root?.querySelector(".annotated-original .original-text")?.textContent ?? "";
}

/**
 * 跟踪所在段落根节点上某个 CSS 类的开关状态。
 * 定位不靠 ref：页面为每个段落渲染了 id={`passage-${passageId}`} 锚点，
 * 从锚点向下找 [data-passage-root]。类的切换发生在 DOM 上
 * （toggleRootClass），本 hook 订阅全页共用的 MutationObserver 同步回 React 状态，
 * 保证按钮高亮与 aria-pressed 正确 —— 不引入跨组件共享状态，
 * 正文保持纯 server 直出。
 */
function usePassageClassState(passageId: string, cls: string) {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const anchor = document.getElementById(`passage-${passageId}`);
    const root = anchor?.querySelector("[data-passage-root]");
    if (!root) return;
    const update = () => setActive(root.classList.contains(cls));
    update();
    return subscribePassageClass(root, update);
  }, [passageId, cls]);
  return active;
}

/**
 * 段落工具条 —— 独立客户端岛（章节页减重 v2）。
 *
 * 刻意**不接收任何 ReactNode props、不包裹正文**：静态导出会把 client
 * 组件的 server children 完整序列化进 RSC 载荷，正文因此只能由服务端
 * 直出（PassageView 的 HTML），本岛只拿标量 props。
 * 分栏/拼音/批注等「显示状态」通过切换 [data-passage-root] 上的 CSS 类
 * 实现（globals.css 中对应规则），正文区域用 MutationObserver / CSS
 * 感知，不与本岛共享 React 状态 —— 避免重新引入 client 祖先。
 */
export default function PassageToolbar({ chapterId, passageId, chapterTitle, passageNum }: PassageToolbarProps) {
  const [bookmarked, setBookmarked] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [copyMenuOpen, setCopyMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const isSpeakingRef = useRef(false);
  const immersive = useImmersive();
  const pinyinOn = usePassageClassState(passageId, "pinyin-on");
  const splitOn = usePassageClassState(passageId, "split-view");

  useEffect(() => {
    // 挂载后读 localStorage 收藏状态（hydration-safe）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBookmarked(isBookmarked(chapterId, passageId));
  }, [chapterId, passageId]);

  // 复制菜单：点击外部关闭
  useEffect(() => {
    if (!copyMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-copy-menu]")) setCopyMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [copyMenuOpen]);

  /** 复制（原文 / 带出处引用两种格式），复制后短暂显示已复制 */
  const doCopy = (el: HTMLElement, mode: "plain" | "cite") => {
    const original = getOriginalFromDom(el);
    if (!original) return;
    let text = original;
    if (mode === "cite") {
      const url = `${window.location.origin}/chapters/${chapterId}#passage-${passageId}`;
      const title = chapterTitle ?? chapterId;
      text = `${original}\n\n——《庄子·${title}》${passageNum ? ` · 第${passageNum}节` : ""}\n${url}`;
    }
    navigator.clipboard.writeText(text);
    setCopyMenuOpen(false);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const handleBookmark = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const original = getOriginalFromDom(e.currentTarget);
    const added = toggleBookmark(chapterId, passageId, chapterTitle ?? chapterId, original);
    setBookmarked(added);
  }, [chapterId, chapterTitle, passageId]);

  /** 在所在段落根节点上切换 CSS 类（分栏/拼音/批注的显示状态） */
  const toggleRootClass = (e: React.MouseEvent<HTMLElement>, cls: string) => {
    const root = (e.currentTarget as HTMLElement).closest("[data-passage-root]");
    if (root) root.classList.toggle(cls);
  };

  const getPassageRoot = useCallback(() => {
    const anchor = document.getElementById(`passage-${passageId}`);
    return anchor?.querySelector<HTMLElement>("[data-passage-root]") ?? null;
  }, [passageId]);

  const cleanupSpeech = useCallback(() => {
    isSpeakingRef.current = false;
    if ("speechSynthesis" in window) {
      speechSynthesis.cancel();
    }
    const root = getPassageRoot();
    if (root) {
      root.classList.remove("speech-active-passage");
      root.querySelectorAll(".trans-sent.sent-speaking-active").forEach((el) => {
        el.classList.remove("sent-speaking-active");
      });
    }
    setSpeaking(false);
  }, [getPassageRoot]);

  // 监听全局朗读事件：若其他段落触发朗读，立即重置本段朗读波浪动画与高亮
  useEffect(() => {
    const handleSpeechStart = (e: Event) => {
      const customEvent = e as CustomEvent<{ passageId?: string }>;
      if (customEvent.detail?.passageId !== passageId) {
        cleanupSpeech();
      }
    };
    window.addEventListener("zhuangzi:speech-start", handleSpeechStart);
    return () => {
      window.removeEventListener("zhuangzi:speech-start", handleSpeechStart);
      cleanupSpeech();
    };
  }, [passageId, cleanupSpeech]);

  const handleSpeak = useCallback((e: React.MouseEvent<HTMLElement>) => {
    if (!("speechSynthesis" in window)) return;
    if (speaking) {
      cleanupSpeech();
      return;
    }
    const original = getOriginalFromDom(e.currentTarget);
    if (!original) return;
    const root = getPassageRoot();
    if (!root) return;

    cleanupSpeech();
    window.dispatchEvent(new CustomEvent("zhuangzi:speech-start", { detail: { passageId } }));

    root.classList.add("speech-active-passage");
    isSpeakingRef.current = true;
    setSpeaking(true);

    // 将段落原文按句末标点切分为句子队列
    const sents = original.match(/[^。！？；]+[。！？；”’』」]?/g) || [original];
    const transSents = Array.from(root.querySelectorAll<HTMLElement>(".translation-text .trans-sent"));

    const playSentence = (index: number) => {
      if (!isSpeakingRef.current || index >= sents.length) {
        cleanupSpeech();
        return;
      }

      // 「字随声动」：同步高亮右侧译文中对应的句子
      if (transSents.length > 0) {
        transSents.forEach((el) => el.classList.remove("sent-speaking-active"));
        let target: HTMLElement | null | undefined = root.querySelector<HTMLElement>(`.translation-text .trans-sent[data-sent-idx="${index}"]`);
        if (!target) {
          const mappedIdx = Math.min(transSents.length - 1, Math.floor((index / sents.length) * transSents.length));
          target = transSents[mappedIdx];
        }
        if (target) {
          target.classList.add("sent-speaking-active");
        }
      }

      const utterance = new SpeechSynthesisUtterance(sents[index]);
      utterance.lang = "zh-CN";
      utterance.rate = 0.7;
      utterance.onend = () => {
        if (!isSpeakingRef.current) return;
        playSentence(index + 1);
      };
      utterance.onerror = () => {
        cleanupSpeech();
      };
      speechSynthesis.speak(utterance);
    };

    playSentence(0);
  }, [cleanupSpeech, getPassageRoot, passageId, speaking]);

  return (
    <div className="sticky top-14 z-30 flex justify-end mb-1 transition-opacity duration-200 passage-toolbar">
      <div className="flex items-center gap-0.5 bg-[var(--bg-card)]/90 backdrop-blur-sm rounded-lg border border-[var(--border-light)] shadow-sm px-1 py-0.5">
        {/* Bookmark */}
        <button onClick={handleBookmark}
          className={`p-1.5 rounded hover:bg-[var(--hover-bg)] transition-colors ${bookmarked ? "text-[var(--text-accent)]" : "text-[var(--text-muted)]"}`}
          aria-label={bookmarked ? "取消收藏" : "收藏"}
          aria-pressed={bookmarked}>
          <Icon name="star" className="w-3.5 h-3.5" fill={bookmarked ? "currentColor" : "none"} strokeWidth={1.5} />
        </button>
        {/* Annotate */}
        <button onClick={(e) => toggleRootClass(e, "annotation-on")}
          className="p-1.5 rounded hover:bg-[var(--hover-bg)] text-[var(--text-muted)] hover:text-[var(--text-accent)] transition-colors" aria-label="批注">
          <Icon name="pencil" className="w-3.5 h-3.5" fill="none" strokeWidth={1.5} />
        </button>
        {/* Copy（点击展开：复制原文 / 带出处引用） */}
        <div className="relative" data-copy-menu>
          <button
            onClick={() => setCopyMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={copyMenuOpen}
            className={`p-1.5 rounded hover:bg-[var(--hover-bg)] transition-colors ${copied ? "text-[var(--text-accent)]" : "text-[var(--text-muted)] hover:text-[var(--text-accent)]"}`}
            aria-label={copied ? "已复制" : "复制"}
          >
            {copied ? (
              <Icon name="check" className="w-3.5 h-3.5" fill="none" strokeWidth={2} />
            ) : (
              <Icon name="clipboard" className="w-3.5 h-3.5" fill="none" strokeWidth={1.5} />
            )}
          </button>
          {copyMenuOpen && (
            <div
              role="menu"
              aria-label="复制选项"
              className="absolute right-0 top-full mt-1 z-40 min-w-[9rem] rounded-lg border border-[var(--border-light)] bg-[var(--bg-card)] shadow-lg py-1 text-left animate-fade-in"
            >
              <button
                role="menuitem"
                onClick={(e) => doCopy(e.currentTarget, "plain")}
                className="block w-full px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-colors"
              >
                复制原文
              </button>
              <button
                role="menuitem"
                onClick={(e) => doCopy(e.currentTarget, "cite")}
                className="block w-full px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-colors"
              >
                复制带出处引用
              </button>
            </div>
          )}
        </div>
        {/* Permalink */}
        <button onClick={() => {
          const url = `${window.location.origin}/chapters/${chapterId}#passage-${passageId}`;
          navigator.clipboard.writeText(url);
          setLinkCopied(true);
          setTimeout(() => setLinkCopied(false), 1500);
        }}
          className="p-1.5 rounded hover:bg-[var(--hover-bg)] text-[var(--text-muted)] hover:text-[var(--text-accent)] transition-colors"
          aria-label={linkCopied ? "已复制链接" : "复制段落链接"}>
          {linkCopied ? (
            <Icon name="check" className="w-3.5 h-3.5 text-[var(--text-accent)]" fill="none" strokeWidth={2} />
          ) : (
            <Icon name="link" className="w-3.5 h-3.5" fill="none" strokeWidth={1.5} />
          )}
        </button>
        {/* Pinyin toggle */}
        <button onClick={(e) => toggleRootClass(e, "pinyin-on")}
          className={`p-1.5 rounded hover:bg-[var(--hover-bg)] transition-colors ${pinyinOn ? "text-[var(--text-accent)]" : "text-[var(--text-muted)]"}`}
          aria-label={pinyinOn ? "隐藏拼音" : "显示拼音"}
          aria-pressed={pinyinOn}>
          <span className="text-[11px] font-medium tracking-tight">拼</span>
        </button>
        {/* Immersive reading toggle */}
        <button onClick={() => toggleImmersive()}
          className={`p-1.5 rounded hover:bg-[var(--hover-bg)] transition-colors ${immersive ? "text-[var(--text-accent)]" : "text-[var(--text-muted)]"}`}
          aria-label={immersive ? "退出沉浸阅读" : "沉浸阅读"}
          aria-pressed={immersive}>
          <Icon name="eye-off" className="w-3.5 h-3.5" fill="none" strokeWidth={1.5} />
        </button>
        {/* Split view toggle */}
        <button onClick={(e) => toggleRootClass(e, "split-view")}
          className={`p-1.5 rounded hover:bg-[var(--hover-bg)] transition-colors ${splitOn ? "text-[var(--text-accent)]" : "text-[var(--text-muted)]"}`}
          aria-label={splitOn ? "上下排列" : "分栏对照"}
          aria-pressed={splitOn}>
          <Icon name="columns" className="w-3.5 h-3.5" fill="none" strokeWidth={1.5} />
        </button>
        {/* TTS — read aloud */}
        <button onClick={handleSpeak}
          className={`p-1.5 rounded hover:bg-[var(--hover-bg)] transition-colors ${speaking ? "text-[var(--text-accent)]" : "text-[var(--text-muted)]"}`}
          aria-label={speaking ? "停止朗读" : "朗读原文"}
          aria-pressed={speaking}>
          {speaking ? (
            <Icon name="stop" className="w-3.5 h-3.5 animate-pulse" fill="none" strokeWidth={1.5} />
          ) : (
            <Icon name="speaker" className="w-3.5 h-3.5" fill="none" strokeWidth={1.5} />
          )}
        </button>
      </div>
    </div>
  );
}
