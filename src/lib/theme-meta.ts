/**
 * 主题元数据 —— 客户端运行时唯一需要的部分。
 *
 * 完整调色板在 @/lib/theme（仅构建期 / 测试使用：生成 globals.css 的调色板
 * 区块与内联脚本）。ThemeProvider / ThemeSwitcher 只 import 本文件，
 * 五套调色板（约 100 个颜色字面量）不进每个路由都要下载的共享 JS。
 */
export type ThemeName = "xuanzhi" | "zhujian" | "moyun" | "qinghua" | "yedu";

export interface ThemeMeta {
  /** 中文显示名 */
  name: string;
  /** 切换器图标 */
  icon: string;
  /** 是否深色配色 —— 用于 color-scheme 与 <meta name="theme-color"> */
  dark: boolean;
  /** 浏览器 UI 主题色 */
  themeColor: string;
  /** 切换器小圆点颜色，须等于该主题的 textAccent（测试锁定） */
  swatch: string;
}

export const THEME_META: Record<ThemeName, ThemeMeta> = {
  xuanzhi: { name: "宣纸", icon: "宣", dark: false, themeColor: "#8E5431", swatch: "#8E5431" },
  zhujian: { name: "竹简", icon: "竹", dark: false, themeColor: "#5A6B3A", swatch: "#5A6B3A" },
  moyun: { name: "墨韵", icon: "墨", dark: false, themeColor: "#333333", swatch: "#333333" },
  qinghua: { name: "青花", icon: "青", dark: false, themeColor: "#2B5F8A", swatch: "#2B5F8A" },
  yedu: { name: "夜读", icon: "夜", dark: true, themeColor: "#14120F", swatch: "#D49B6A" },
};

export const DEFAULT_THEME: ThemeName = "xuanzhi";
export const THEME_STORAGE_KEY = "siteTheme";

export const themeNames = Object.keys(THEME_META) as ThemeName[];

export function isThemeName(value: unknown): value is ThemeName {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(THEME_META, value);
}

/**
 * 运行时把主题写入 document —— 与内联脚本完全相同的副作用。
 */
export function applyThemeToDocument(name: ThemeName): void {
  const root = document.documentElement;
  const def = THEME_META[name];
  root.setAttribute("data-theme", name);
  // 深色主题挂上 .dark：globals.css 的 .dark 结构性规则由此生效
  root.classList.toggle("dark", def.dark);
  // 让原生控件（滚动条、表单、日期选择器）跟随主题明暗
  root.style.colorScheme = def.dark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", def.themeColor);
}
