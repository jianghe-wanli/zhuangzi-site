"use client";

import { useEffect, useRef, useState } from "react";

export default function ReadingProgress() {
  const barRef = useRef<HTMLDivElement>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const scrollTop = window.scrollY;
          const docHeight =
            document.documentElement.scrollHeight - window.innerHeight;
          const scrollProgress =
            docHeight > 0 ? Math.min((scrollTop / docHeight) * 100, 100) : 0;
          // 进度条宽度直接写 DOM：此前每个滚动帧 setState 触发一次 React 重渲染；
          // 现在 React 只在「回到顶部」按钮显隐翻转时才渲染
          if (barRef.current) barRef.current.style.width = `${scrollProgress}%`;
          setShowBackToTop(scrollTop > 500);
          ticking = false;
        });
        ticking = true;
      }
    };

    handleScroll(); // 刷新后浏览器恢复了滚动位置时，首帧即同步
    window.addEventListener("scroll", handleScroll, { passive: true });
    // 内容高度变化（窗口缩放、图片/字体加载）也会改变进度
    window.addEventListener("resize", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, []);

  const scrollToTop = () => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <>
      {/* Progress bar — sits below sticky nav */}
      <div className="reading-progress fixed top-14 left-0 right-0 z-50 no-print" aria-hidden="true">
        <div className="h-[2px] bg-[var(--border-light)]">
          <div
            ref={barRef}
            className="h-full w-0 bg-gradient-to-r from-[var(--text-accent)] via-[var(--color-accent-gold)] to-[var(--text-accent)] transition-[width] duration-200 ease-out"
          />
        </div>
      </div>

      {/* Back to top button —— 置于聊天球上方（视觉复审 N5-1），
          bottom 由 .back-to-top 类控制（含安全区），避免与聊天球叠压 */}
      <button
        type="button"
        onClick={scrollToTop}
        // 隐藏时仅 opacity:0 —— 不移出 Tab 序列的话键盘用户会聚焦到一个看不见的按钮
        tabIndex={showBackToTop ? 0 : -1}
        aria-hidden={!showBackToTop}
        className={`back-to-top fixed right-4 z-40 w-11 h-11 rounded-full bg-[var(--bg-card)] border border-[var(--border-color)] shadow-md flex items-center justify-center transition-all duration-300 no-print hover:border-[var(--text-accent)] hover:shadow-lg ${
          showBackToTop
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-4 pointer-events-none"
        }`}
        aria-label="回到顶部"
        title="回到顶部"
      >
        <svg
          className="w-5 h-5 text-[var(--text-accent)]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4.5 15.75l7.5-7.5 7.5 7.5"
          />
        </svg>
      </button>
    </>
  );
}
