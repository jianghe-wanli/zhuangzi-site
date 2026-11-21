import { buildDailyTranslations } from "@/lib/daily";

// 静态导出：构建期生成 out/daily-translations.json（见 src/lib/daily.ts）
export const dynamic = "force-static";

export function GET() {
  return Response.json(buildDailyTranslations());
}
