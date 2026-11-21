/**
 * public/manifest.json 与站点事实源保持一致。
 * 实际偏差：manifest 的 theme_color / background_color 曾停在旧色值
 * （#8B5E3C / #FBF9F5），而 theme.ts 与 <meta name="theme-color"> 已是
 * #8E5431 / #FAF8F4 —— 安装后的启动画面与标题栏和页面有一道色差。
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DEFAULT_THEME, themes } from "@/lib/theme";

const PUBLIC = join(__dirname, "..", "public");
const manifest = JSON.parse(readFileSync(join(PUBLIC, "manifest.json"), "utf8")) as {
  theme_color: string;
  background_color: string;
  start_url: string;
  scope: string;
  icons: { src: string; sizes: string; purpose?: string }[];
  shortcuts: { url: string }[];
};

/** 读 PNG 的 IHDR 宽高 */
function pngSize(file: string): string {
  const buf = readFileSync(file);
  return `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`;
}

describe("manifest.json", () => {
  it("主题色 / 背景色与默认主题一致", () => {
    const theme = themes[DEFAULT_THEME];
    expect(manifest.theme_color.toUpperCase()).toBe(theme.themeColor.toUpperCase());
    expect(manifest.background_color.toUpperCase()).toBe(theme.colors.bgPrimary.toUpperCase());
  });

  it("图标文件存在，且 PNG 实际尺寸与声明一致", () => {
    for (const icon of manifest.icons) {
      const file = join(PUBLIC, icon.src);
      expect(existsSync(file), icon.src).toBe(true);
      if (icon.src.endsWith(".png")) expect(pngSize(file), icon.src).toBe(icon.sizes);
    }
    expect(manifest.icons.some((i) => i.purpose === "maskable")).toBe(true);
    expect(manifest.icons.some((i) => i.sizes === "512x512")).toBe(true);
  });

  it("start_url 与快捷方式都在 scope 内，且以 / 结尾（与 trailingSlash 一致，避免 308）", () => {
    for (const url of [manifest.start_url, ...manifest.shortcuts.map((s) => s.url)]) {
      expect(url.startsWith(manifest.scope), url).toBe(true);
      expect(url.endsWith("/"), url).toBe(true);
    }
  });
});
