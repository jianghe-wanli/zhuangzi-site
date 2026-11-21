import { concepts } from "@/data/concepts";

import { conceptBlocks } from "../blocks";

export const dynamic = "force-static";

export function generateStaticParams() {
  return concepts.map((c) => ({ id: c.id }));
}

/** 概念页静态块的 HTML（客户端路由进入页面时由 StaticBlock 取用） */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const concept = concepts.find((c) => c.id === id);
  if (!concept) return new Response("{}", { status: 404 });
  return Response.json(conceptBlocks(concept));
}
