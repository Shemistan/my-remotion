import { describe, expect, it } from "vitest";
import { canonicalHash, canonicalJson } from "../src/canonical.js";

describe("canonical", () => {
  it("ключи по алфавиту, массивы как есть", () => {
    expect(canonicalJson({ b: 1, a: [2, 1], c: { z: null, y: "ё" } })).toBe('{"a":[2,1],"b":1,"c":{"y":"ё","z":null}}');
    expect(canonicalHash({ b: 1, a: [2, 1] })).toBe(canonicalHash({ a: [2, 1], b: 1 }));
    expect(canonicalHash({ a: [1, 2] })).not.toBe(canonicalHash({ a: [2, 1] }));
  });

  it("undefined в объекте опускается, как в JSON", () => {
    expect(canonicalJson({ a: undefined, b: 1 })).toBe('{"b":1}');
    expect(canonicalHash({ a: undefined, b: 1 })).toBe(canonicalHash({ b: 1 }));
  });

  it("sha256 hex", () => {
    expect(canonicalHash({})).toMatch(/^[0-9a-f]{64}$/);
    // sha256("{}")
    expect(canonicalHash({})).toBe("44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a");
  });

  it("неподдерживаемые значения — ошибка, а не тихий null", () => {
    expect(() => canonicalJson({ a: Number.NaN })).toThrow();
    expect(() => canonicalJson({ a: () => 1 })).toThrow();
  });
});
