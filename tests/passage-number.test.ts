import { describe, expect, it } from "vitest";

import { chaptersMeta, passageNumber } from "@/data/chapters/metadata";
import { passageNumberFromId } from "@/lib/passage-number";

describe("passageNumberFromId", () => {
  it("与 metadata 的 passageIds 查表结果在全量数据上一致", () => {
    let n = 0;
    for (const m of chaptersMeta) {
      for (const pid of m.passageIds ?? []) {
        expect(passageNumberFromId(m.id, pid)).toBe(passageNumber(m.id, pid));
        n++;
      }
    }
    expect(n).toBeGreaterThan(100);
  });

  it("非法输入返回 null", () => {
    expect(passageNumberFromId("01-xiaoyao-you", "02-qiwu-lun-1")).toBeNull();
    expect(passageNumberFromId("01-xiaoyao-you", "01-xiaoyao-you-x")).toBeNull();
    expect(passageNumberFromId("01-xiaoyao-you", "01-xiaoyao-you-0")).toBeNull();
  });
});
