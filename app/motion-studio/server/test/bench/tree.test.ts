// Грязное дерево в прогоне (S2-fix2, m5): отказ на старте без --allow-dirty; сцена, во время
// которой дерево или kit поменялись, помечается `-dirty` с хэшем kit.
import { describe, expect, it } from "vitest";
import { dirtyStartError, sceneTree } from "../../src/bench/tree.js";

const clean = { dirty: false, kit_hash: "sha256:aaaa" };

describe("dirtyStartError", () => {
  it("грязное дерево без --allow-dirty — отказ с подсказкой; с флагом или чистое — нет", () => {
    expect(dirtyStartError({ dirty: true, kit_hash: "sha256:aaaa" }, false)).toMatch(/--allow-dirty/);
    expect(dirtyStartError({ dirty: true, kit_hash: "sha256:aaaa" }, true)).toBeNull();
    expect(dirtyStartError(clean, false)).toBeNull();
  });
});

describe("sceneTree", () => {
  it("дерево чистое до и после сцены, kit тот же — коммит как есть", () => {
    expect(sceneTree("abc1234", clean, clean)).toEqual({ commit: "abc1234", dirty: false, kit_hash: "sha256:aaaa" });
  });
  it("правка появилась во время сцены — -dirty", () => {
    expect(sceneTree("abc1234", clean, { dirty: true, kit_hash: "sha256:aaaa" })).toMatchObject({ commit: "abc1234-dirty", dirty: true });
  });
  it("kit поменялся во время сцены (правка и откат) — -dirty и оба хэша", () => {
    expect(sceneTree("abc1234", clean, { dirty: false, kit_hash: "sha256:bbbb" })).toEqual({ commit: "abc1234-dirty", dirty: true, kit_hash: "sha256:bbbb", kit_hash_start: "sha256:aaaa" });
  });
  it("грязно уже на старте (--allow-dirty) — -dirty", () => {
    expect(sceneTree("abc1234", { dirty: true, kit_hash: "sha256:aaaa" }, { dirty: true, kit_hash: "sha256:aaaa" }).commit).toBe("abc1234-dirty");
  });
});
