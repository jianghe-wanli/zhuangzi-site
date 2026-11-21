/**
 * 由 passageId 推出篇内节号（1-based）。
 *
 * 全书 passageId 恒为 `${chapterId}-${n}`（scripts/validate-data.mjs 保证唯一，
 * tests/passage-number.test.ts 对全量数据校验与 metadata 的 passageIds 一致），
 * 因此客户端无需为了节号打包 50KB 的 metadata.json。
 */
export function passageNumberFromId(chapterId: string, passageId: string): number | null {
  const prefix = `${chapterId}-`;
  if (!passageId.startsWith(prefix)) return null;
  const rest = passageId.slice(prefix.length);
  if (!/^[1-9]\d*$/.test(rest)) return null;
  return Number(rest);
}
