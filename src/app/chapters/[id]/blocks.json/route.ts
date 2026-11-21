import { chapters } from "@/data/chapters";

import { chapterBlocks } from "../blocks";

export const dynamic = "force-static";

export function generateStaticParams() {
  return chapters.map((ch) => ({ id: ch.id }));
}

/** 章节页静态块的 HTML（客户端路由进入页面时由 StaticBlock 取用） */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const chapter = chapters.find((c) => c.id === id);
  if (!chapter) return new Response("{}", { status: 404 });
  return Response.json(chapterBlocks(chapter));
}
