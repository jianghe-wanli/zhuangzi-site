import { conceptListBlocks } from "../list-blocks";

export const dynamic = "force-static";

/** 概念列表页静态块的 HTML（客户端路由进入页面时由 StaticBlock 取用） */
export function GET() {
  return Response.json(conceptListBlocks());
}
