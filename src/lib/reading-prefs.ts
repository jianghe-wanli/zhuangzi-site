/**
 * 阅读排版偏好（字号 / 行距 / 版心 / 双行夹注）的存储约定。
 *
 * ReadingSettings 面板与 <head> 内联脚本共用这一份：
 * 偏好必须在首帧绘制前写到 <html>，否则调过字号的读者每次打开篇章页，
 * 正文都会先按默认排版渲染、水合后再整体重排（布局偏移）。
 */
export const READING_SETTINGS_KEY = "readingSettings";
export const JIAZHU_MODE_KEY = "zhuangzi-jiazhu-mode";

/** 设置值 → CSS 长度（localStorage 存符号值，:root 变量存可用的 CSS 值） */
export const READING_CSS_VALUE_MAP: Record<string, Record<string, string>> = {
  fontSize: { sm: "0.875rem", base: "1rem", lg: "1.125rem", xl: "1.25rem" },
  lineHeight: { "1.6": "1.6", "1.9": "1.9", "2.2": "2.2", "2.5": "2.5" },
  readingWidth: { narrow: "36rem", normal: "48rem", wide: "56rem" },
};

export function readingCssValue(key: string, val: string): string | undefined {
  return READING_CSS_VALUE_MAP[key]?.[val];
}

/**
 * 首帧前恢复排版偏好的内联脚本（与 ReadingSettings 挂载时的恢复逻辑等价）。
 * 只接受白名单内的键与取值；内容全部为构建期常量。
 */
export function buildInlineReadingPrefsScript(): string {
  // lineHeight 的符号值即 CSS 值，脚本里不必带映射表
  const map = { fontSize: READING_CSS_VALUE_MAP.fontSize, readingWidth: READING_CSS_VALUE_MAP.readingWidth };
  const lineHeights = Object.keys(READING_CSS_VALUE_MAP.lineHeight!);
  return `(function(){try{var r=document.documentElement,s=JSON.parse(localStorage.getItem(${JSON.stringify(
    READING_SETTINGS_KEY
  )})||'{}'),V=${JSON.stringify(map)},k,v;for(k in V){v=V[k][s[k]];if(v)r.style.setProperty('--reading-'+k,v);}if(${JSON.stringify(
    lineHeights
  )}.indexOf(s.lineHeight)>-1)r.style.setProperty('--reading-lineHeight',s.lineHeight);if(localStorage.getItem(${JSON.stringify(
    JIAZHU_MODE_KEY
  )})==='jiazhu')r.classList.add('jiazhu-mode');}catch(e){}})()`;
}
