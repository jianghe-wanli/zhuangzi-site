import Link from "next/link";

import { concepts } from "@/data/concepts";
import { internalHref } from "@/lib/static-html";

interface ConceptTagProps {
  conceptId: string;
  name?: string;
  size?: "sm" | "md";
}

function tagClass(size: "sm" | "md") {
  const sizeClasses = size === "sm" ? "px-2.5 py-0.5 text-xs" : "px-3 py-1 text-sm";
  return `tag ${sizeClasses} font-serif tracking-wide cursor-pointer`;
}

const nameOf = (conceptId: string, name?: string) => name || concepts.find((c) => c.id === conceptId)?.name;

export default function ConceptTag({ conceptId, name, size = "sm" }: ConceptTagProps) {
  const displayName = nameOf(conceptId, name);
  if (!displayName) return null;

  return (
    <Link href={`/concepts/${conceptId}`} prefetch={false} className={tagClass(size)}>
      {displayName}
    </Link>
  );
}

/** 静态块内用的版本：普通 <a>（next/link 是客户端组件，不能进静态块） */
export function StaticConceptTag({ conceptId, name, size = "sm" }: ConceptTagProps) {
  const displayName = nameOf(conceptId, name);
  if (!displayName) return null;

  return (
    <a href={internalHref(`/concepts/${conceptId}`)} className={tagClass(size)}>
      {displayName}
    </a>
  );
}
