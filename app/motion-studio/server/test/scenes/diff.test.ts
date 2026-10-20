import { describe, expect, it } from "vitest";
import { jsonDiff } from "../../src/scenes/diff.js";

describe("jsonDiff (JSON Pointer)", () => {
  it("равные значения — пусто", () => expect(jsonDiff({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toEqual([]));
  it("вложенные изменения, добавления и удаления", () => {
    expect(jsonDiff({ a: 1, b: { c: [1, 2] }, gone: true }, { a: 2, b: { c: [1, 3, 4] }, added: "x" })).toEqual([
      { path: "/a", before: 1, after: 2 },
      { path: "/added", after: "x" },
      { path: "/b/c/1", before: 2, after: 3 },
      { path: "/b/c/2", after: 4 },
      { path: "/gone", before: true },
    ]);
  });
  it("смена типа — замена целиком; корень", () => {
    expect(jsonDiff({ a: [1] }, { a: { 0: 1 } })).toEqual([{ path: "/a", before: [1], after: { 0: 1 } }]);
    expect(jsonDiff(1, "1")).toEqual([{ path: "", before: 1, after: "1" }]);
    expect(jsonDiff(undefined, { a: 1 })).toEqual([{ path: "", after: { a: 1 } }]);
  });
  it("экранирование ~ и / в ключах (RFC 6901)", () => {
    expect(jsonDiff({ "a/b": 1, "c~d": 1 }, { "a/b": 2, "c~d": 2 })).toEqual([
      { path: "/a~1b", before: 1, after: 2 },
      { path: "/c~0d", before: 1, after: 2 },
    ]);
  });
});
