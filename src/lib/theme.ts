/**
 * 主题系统 —— 单一数据源 (single source of truth)
 *
 * 背景：调色板此前存在三份手工同步的副本
 *   1. globals.css 的 :root / .dark
 *   2. components/ThemeProvider.tsx 的 themes 对象
 *   3. app/layout.tsx 内联防闪烁 <script> 里的字面量
 * 任何一处改动没同步到另两处，就会出现「样式闪烁」或「无障碍修复被静默覆盖」。
 * 实际事故：globals.css 把 --color-ink-muted 从 #A89880(2.67:1) 修正为
 * #7D6E57(4.71:1) 以满足 WCAG AA，但 ThemeProvider 与内联脚本仍写
 * #A89880，且它们以 **行内样式** 落到 documentElement 上，优先级高于
 * 样式表，于是修复被完全抵消。
 *
 * 现在：调色板只在本文件定义；globals.css 的调色板区块是 buildThemeCss()
 * 的逐字输出（由测试锁定一致），内联脚本与 React Provider 只切换
 * <html data-theme>，不再写行内样式。tests/unit/theme-contrast.test.ts 会对每个主题校验对比度，
 * 保证 AA 修复不会再被悄悄改坏。
 */

import {
  DEFAULT_THEME,
  THEME_META,
  THEME_STORAGE_KEY,
  type ThemeMeta,
  type ThemeName,
  themeNames,
} from "./theme-meta";

// 客户端组件请直接 import "@/lib/theme-meta"，不要经由本文件（会把调色板带进 bundle）
export { applyThemeToDocument, DEFAULT_THEME, isThemeName, THEME_STORAGE_KEY, themeNames } from "./theme-meta";
export type { ThemeName };

/** 一个主题需要覆盖的全部可换肤颜色 */
export interface ThemeColors {
  bgPrimary: string;
  bgSecondary: string;
  bgCard: string;
  bgCardHover: string;
  textPrimary: string;
  textSecondary: string;
  /** 辅助文字。必须 ≥4.5:1（对 bgPrimary 与 bgCard 两个表面都要满足） */
  textMuted: string;
  textAccent: string;
  accentDeep: string;
  accentGold: string;
  /** 远山竹青（设计规范 v1.0 新增）——概念标签、探索性功能点睛 */
  accentBamboo: string;
  /** 危险/错误语义色（v1.0 补充）：错误提示、删除操作。必须对 bgPrimary 满足 AA ≥4.5:1 */
  danger: string;
  /** 朱砂色（用于印章、眉批、校勘朱记）。必须对 bgPrimary 与 bgCard 满足 AA ≥4.5:1 */
  accentVermilion: string;
  /** 主按钮文字色（用于 bg-[var(--text-accent)] 按钮）。必须对 textAccent 满足 AA ≥4.5:1 */
  btnAccentText: string;
  borderColor: string;
  borderLight: string;
  borderStrong: string;
  hoverBg: string;
  hoverBgStrong: string;
  selectionBg: string;
  /** 阴影基色（rgb 三元组字符串），深色主题用纯黑 */
  shadowRgb: string;
}

export interface ThemeDefinition extends ThemeMeta {
  colors: ThemeColors;
}

export const themes: Record<ThemeName, ThemeDefinition> = {
  xuanzhi: {
    ...THEME_META.xuanzhi,
    colors: {
      bgPrimary: "#FAF8F4",
      bgSecondary: "#F3ECE1",
      bgCard: "#FFFFFF",
      bgCardHover: "#FDFBF7",
      textPrimary: "#231C14",
      textSecondary: "#665747",
      // 规范 #827463 → 4.28:1 不足 AA；加深为 #7E7062 → 4.52:1
      textMuted: "#7E7062",
      textAccent: "#8E5431",
      accentDeep: "#703D20",
      accentGold: "#BFA05E",
      accentBamboo: "#416353",
      danger: "#C24438",
      accentVermilion: "#B83B2E",
      btnAccentText: "#FFFFFF",
      borderColor: "#E8DFCF",
      borderLight: "#F2ECE1",
      borderStrong: "#D5C7B0",
      hoverBg: "rgba(142, 84, 49, 0.06)",
      hoverBgStrong: "rgba(142, 84, 49, 0.10)",
      selectionBg: "rgba(142, 84, 49, 0.15)",
      shadowRgb: "35, 28, 20",
    },
  },
  zhujian: {
    ...THEME_META.zhujian,
    colors: {
      bgPrimary: "#F3F0E4",
      bgSecondary: "#E8E3D2",
      bgCard: "#FAF7EC",
      bgCardHover: "#F2EEDD",
      textPrimary: "#3A3520",
      textSecondary: "#6B6340",
      // was #9B9060 → 2.81:1
      textMuted: "#766D49",
      textAccent: "#5A6B3A",
      accentDeep: "#3F4C26",
      accentGold: "#A08B4A",
      // 竹简主题：竹青偏正绿
      accentBamboo: "#47705A",
      danger: "#A4452E",
      accentVermilion: "#AD362B",
      btnAccentText: "#FFFFFF",
      borderColor: "#D8D0B0",
      borderLight: "#E8E2C8",
      borderStrong: "#C4B994",
      hoverBg: "rgba(90, 107, 58, 0.07)",
      hoverBgStrong: "rgba(90, 107, 58, 0.12)",
      selectionBg: "rgba(90, 107, 58, 0.16)",
      shadowRgb: "58, 53, 32",
    },
  },
  moyun: {
    ...THEME_META.moyun,
    colors: {
      bgPrimary: "#F5F5F5",
      bgSecondary: "#EEEEEE",
      bgCard: "#FFFFFF",
      bgCardHover: "#F7F7F7",
      textPrimary: "#1A1A1A",
      textSecondary: "#5C5C5C",
      // was #999999 → 2.61:1
      textMuted: "#707070",
      textAccent: "#333333",
      accentDeep: "#111111",
      accentGold: "#8A8A8A",
      // 墨韵主题：低饱和灰绿
      accentBamboo: "#55655C",
      danger: "#C0392B",
      accentVermilion: "#B0382C",
      btnAccentText: "#FFFFFF",
      borderColor: "#D5D5D5",
      borderLight: "#E5E5E5",
      borderStrong: "#BDBDBD",
      hoverBg: "rgba(0, 0, 0, 0.04)",
      hoverBgStrong: "rgba(0, 0, 0, 0.08)",
      selectionBg: "rgba(0, 0, 0, 0.12)",
      shadowRgb: "0, 0, 0",
    },
  },
  qinghua: {
    ...THEME_META.qinghua,
    colors: {
      bgPrimary: "#F7F9FB",
      bgSecondary: "#EDF2F7",
      bgCard: "#FFFFFF",
      bgCardHover: "#F4F8FC",
      textPrimary: "#1A2A3A",
      textSecondary: "#4A6278",
      // was #7A8EA0 → 3.21:1
      textMuted: "#647483",
      textAccent: "#2B5F8A",
      accentDeep: "#1B4263",
      accentGold: "#7A93A8",
      // 青花主题：竹青偏青绿
      accentBamboo: "#2F7A6D",
      danger: "#C24438",
      accentVermilion: "#B0382C",
      btnAccentText: "#FFFFFF",
      borderColor: "#D0DDE8",
      borderLight: "#E0EAF3",
      borderStrong: "#B4C7D8",
      hoverBg: "rgba(43, 95, 138, 0.06)",
      hoverBgStrong: "rgba(43, 95, 138, 0.11)",
      selectionBg: "rgba(43, 95, 138, 0.15)",
      shadowRgb: "26, 42, 58",
    },
  },
  /**
   * 夜读 —— 真正的深色主题。
   * 此前 globals.css 里存在 .dark 变量块，但没有任何代码添加 `dark` 类
   * （ThemeProvider 反而每次都 classList.remove("dark")），四个主题全是浅色，
   * 长文夜读没有可用方案。此主题把那份配色接回真实可切换的状态。
   */
  yedu: {
    ...THEME_META.yedu,
    colors: {
      bgPrimary: "#161412",
      bgSecondary: "#1F1B16",
      bgCard: "#24201A",
      bgCardHover: "#2A2620",
      textPrimary: "#EAE4D9",
      textSecondary: "#A69D8E",
      textMuted: "#9A9081",
      textAccent: "#D49B6A",
      accentDeep: "#EFC08A",
      accentGold: "#DEBE7C",
      // 夜读主题：暗夜竹青
      accentBamboo: "#689781",
      danger: "#E06050",
      accentVermilion: "#E56B5B",
      btnAccentText: "#161412",
      borderColor: "#38322A",
      borderLight: "#2C2822",
      borderStrong: "#443E36",
      hoverBg: "rgba(212, 155, 106, 0.08)",
      hoverBgStrong: "rgba(212, 155, 106, 0.14)",
      selectionBg: "rgba(212, 155, 106, 0.22)",
      shadowRgb: "0, 0, 0",
    },
  },
};

/** ThemeColors 字段 → CSS 自定义属性名。内联脚本与 Provider 共用。 */
export const CSS_VAR_BY_KEY: Record<keyof ThemeColors, string> = {
  bgPrimary: "--bg-primary",
  bgSecondary: "--bg-secondary",
  bgCard: "--bg-card",
  bgCardHover: "--bg-card-hover",
  textPrimary: "--text-primary",
  textSecondary: "--text-secondary",
  textMuted: "--text-muted",
  textAccent: "--text-accent",
  accentDeep: "--color-accent-deep",
  accentGold: "--color-accent-gold",
  accentBamboo: "--color-accent-bamboo",
  danger: "--color-danger",
  accentVermilion: "--color-accent-vermilion",
  btnAccentText: "--btn-accent-text",
  borderColor: "--border-color",
  borderLight: "--border-light",
  borderStrong: "--border-strong",
  hoverBg: "--hover-bg",
  hoverBgStrong: "--hover-bg-strong",
  selectionBg: "--selection-bg",
  shadowRgb: "--shadow-rgb",
};

/** 把一个主题展开成 [cssVarName, value][]，供 Provider 与内联脚本使用 */
export function themeCssVarEntries(name: ThemeName): [string, string][] {
  const def = themes[name];
  return (Object.keys(CSS_VAR_BY_KEY) as (keyof ThemeColors)[]).map((key) => [
    CSS_VAR_BY_KEY[key],
    def.colors[key],
  ]);
}

/** globals.css 中调色板区块的起止标记（区块内容必须等于 buildThemeCss()） */
export const THEME_CSS_START = "/* @theme-palette:start */";
export const THEME_CSS_END = "/* @theme-palette:end */";

/**
 * 把全部主题展开成 CSS 规则：默认主题落在 `:root`，其余落在
 * `:root[data-theme="<name>"]`。
 *
 * globals.css 里 THEME_CSS_START/END 之间的区块是它的逐字输出
 * （tests/theme-contrast.test.ts 校验二者一致；改调色板后运行
 * `npx vitest run tests/theme-contrast.test.ts` 会给出应粘贴的内容）。
 *
 * 为什么放样式表而不是由内联脚本写行内样式：五套调色板的 JSON 约 3.9KB，
 * 内联在根布局会在每个页面的 HTML 里出现两次（<script> 一次、RSC 载荷
 * 一次）；放进外置 CSS 只下载一次且可缓存，JS 被禁用时默认主题也完整可用。
 */
export function buildThemeCss(): string {
  const block = (selector: string, name: ThemeName) =>
    `${selector} {\n${themeCssVarEntries(name)
      .map(([k, v]) => `  ${k}: ${v};`)
      .join("\n")}\n}`;
  return [
    block(":root", DEFAULT_THEME),
    ...themeNames
      .filter((n) => n !== DEFAULT_THEME)
      .map((n) => block(`:root[data-theme="${n}"]`, n)),
  ].join("\n");
}

/**
 * 生成防闪烁内联脚本。
 * 在 <head> 里同步执行：读 localStorage 主题 → 立刻在 <html> 上写
 * data-theme（调色板本身在 globals.css，见 buildThemeCss），
 * 避免首帧用默认色渲染再跳变。脚本只携带每个主题的明暗与 theme-color。
 *
 * 没有存过主题时，跟随系统 prefers-color-scheme 选择夜读/默认。
 */
export function buildInlineThemeScript(): string {
  // [themeColor, 是否深色(0/1)]
  const meta = Object.fromEntries(
    themeNames.map((n) => [n, [themes[n].themeColor, themes[n].dark ? 1 : 0]])
  );

  // 注意：这段字符串会进入 dangerouslySetInnerHTML，内容全部来自本模块的
  // 构建期常量（无用户输入），JSON.stringify 已转义引号。
  return `(function(){try{var M=${JSON.stringify(meta)},t=localStorage.getItem(${JSON.stringify(
    THEME_STORAGE_KEY
  )});if(!M.hasOwnProperty(t)){t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'yedu':${JSON.stringify(
    DEFAULT_THEME
  )};}var r=document.documentElement,d=M[t][1];r.setAttribute('data-theme',t);r.classList.toggle('dark',!!d);r.style.colorScheme=d?'dark':'light';var m=document.querySelector('meta[name="theme-color"]');if(m){m.setAttribute('content',M[t][0]);}}catch(e){}})()`;
}
