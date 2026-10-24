// Task 30: смены сцен (`scdet`) → шоты.
import { describe, expect, it } from "vitest";
import { parseScdet, scdetArgs, shotsFromCuts } from "../../src/analysis/shots.js";

describe("parseScdet", () => {
  it("lavfi.scd.time в µs (строки metadata=print)", () => {
    expect(parseScdet("[Parsed_metadata_1 @ 0x1] lavfi.scd.time=12.345\n")).toEqual([12_345_000]);
    const log = [
      "[Parsed_metadata_2 @ 0x600] frame:120  pts:122880  pts_time:4",
      "[Parsed_metadata_2 @ 0x600] lavfi.scd.score=41.2",
      "[Parsed_metadata_2 @ 0x600] lavfi.scd.time=4",
      "[Parsed_metadata_2 @ 0x600] lavfi.scd.time=8.033333",
      "frame=  300 fps=0.0 q=-0.0 size=N/A",
    ].join("\n");
    expect(parseScdet(log)).toEqual([4_000_000, 8_033_333]);
  });

  it("мусор, отрицательное и повторы не дают лишних точек", () => {
    expect(parseScdet("lavfi.scd.time=abc\nlavfi.scd.time=-1\nlavfi.scd.time=2\nlavfi.scd.time=2.0\n")).toEqual([2_000_000]);
    expect(parseScdet("")).toEqual([]);
  });
});

describe("shotsFromCuts", () => {
  it("короткий шот сливается со следующим", () => {
    expect(shotsFromCuts([5_000_000, 5_400_000], 20_000_000).map((s) => [s.start_us, s.end_us])).toEqual([[0, 5_000_000], [5_000_000, 20_000_000]]);
  });

  it("без смен — один шот на весь ролик; id по порядку", () => {
    expect(shotsFromCuts([], 7_000_000)).toEqual([{ id: "sh_1", start_us: 0, end_us: 7_000_000 }]);
    const s = shotsFromCuts([3_000_000, 6_000_000], 9_000_000);
    expect(s.map((x) => x.id)).toEqual(["sh_1", "sh_2", "sh_3"]);
  });

  it("смена у самого конца или начала не даёт хвостового короткого шота; несортированные входы", () => {
    expect(shotsFromCuts([9_500_000, 200_000, 4_000_000], 10_000_000).map((s) => [s.start_us, s.end_us])).toEqual([[0, 4_000_000], [4_000_000, 10_000_000]]);
    expect(shotsFromCuts([0, 10_000_000, 12_000_000], 10_000_000)).toHaveLength(1);
  });

  it("ролик короче минимального шота — один шот", () => {
    expect(shotsFromCuts([300_000], 600_000)).toEqual([{ id: "sh_1", start_us: 0, end_us: 600_000 }]);
  });
});

describe("scdetArgs", () => {
  it("вход только file: с белым списком протоколов и явным демультиплексором", () => {
    const a = scdetArgs("/s/proxy.mp4");
    expect(a.slice(a.indexOf("-protocol_whitelist"), a.indexOf("-protocol_whitelist") + 2)).toEqual(["-protocol_whitelist", "file"]);
    expect(a[a.indexOf("-i") - 2]).toBe("-f");
    expect(a[a.indexOf("-i") + 1]).toBe("file:/s/proxy.mp4");
    expect(a.join(" ")).toMatch(/scdet=threshold=\d+:sc_pass=1,metadata=mode=print:key=lavfi\.scd\.time/);
  });
});
