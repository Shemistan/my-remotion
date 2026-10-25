// S19: зависимости проекта в `<repo>/.deps/` — резолверы путей (сначала .deps, потом PATH).
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEPS_DIRNAME, REPO_ROOT, depsFile, depsRoots, findOnPathSync, isDepsNode, resolveTool } from "../src/deps.js";
import { materialsPath } from "../src/storage/materials.js";
import { makeTmp, removeTmp } from "./helpers.js";

let tmp: string;
let repo: string;
beforeEach(async () => {
  tmp = await makeTmp();
  repo = join(tmp, "repo");
  mkdirSync(repo, { recursive: true });
});
afterEach(async () => removeTmp(tmp));

const exe = (p: string) => {
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, "#!/bin/sh\n");
  chmodSync(p, 0o755);
};

describe("depsRoots", () => {
  it("корень репозитория пакета — каталог с app/motion-studio", () => {
    expect(REPO_ROOT.endsWith("/app/motion-studio")).toBe(false);
    expect(DEPS_DIRNAME).toBe(".deps");
  });

  it("обычный checkout — только <repo>/.deps", () => {
    expect(depsRoots({}, repo)).toEqual([join(repo, ".deps")]);
  });

  it("worktree — свой .deps, затем .deps main checkout", () => {
    const wt = join(repo, ".claude/worktrees/x");
    expect(depsRoots({}, wt)).toEqual([join(wt, ".deps"), join(repo, ".deps")]);
  });

  it("MS_DEPS_DIR заменяет список; относительный — ошибка", () => {
    expect(depsRoots({ MS_DEPS_DIR: "/opt/deps" }, repo)).toEqual(["/opt/deps"]);
    expect(depsRoots({ MS_DEPS_DIR: "  " }, repo)).toEqual([join(repo, ".deps")]);
    expect(() => depsRoots({ MS_DEPS_DIR: "deps" }, repo)).toThrow(/MS_DEPS_DIR/);
  });
});

describe("depsFile", () => {
  it("первый существующий файл по списку корней; нет — undefined", () => {
    const wt = join(repo, ".claude/worktrees/x");
    mkdirSync(wt, { recursive: true });
    expect(depsFile("asr-venv/bin/python", {}, wt)).toBeUndefined();
    exe(join(repo, ".deps/asr-venv/bin/python"));
    expect(depsFile("asr-venv/bin/python", {}, wt)).toBe(join(repo, ".deps/asr-venv/bin/python"));
    exe(join(wt, ".deps/asr-venv/bin/python"));
    expect(depsFile("asr-venv/bin/python", {}, wt)).toBe(join(wt, ".deps/asr-venv/bin/python"));
  });
});

describe("resolveTool", () => {
  it("ffmpeg из .deps/ffmpeg раньше PATH", () => {
    const sys = join(tmp, "sys");
    exe(join(sys, "ffmpeg"));
    expect(resolveTool("ffmpeg", { PATH: sys }, repo)).toEqual({ path: join(sys, "ffmpeg"), source: "path" });
    exe(join(repo, ".deps/ffmpeg/ffmpeg"));
    expect(resolveTool("ffmpeg", { PATH: sys }, repo)).toEqual({ path: join(repo, ".deps/ffmpeg/ffmpeg"), source: "deps" });
  });

  it("неисполняемый файл в .deps не берётся; нигде нет — undefined", () => {
    mkdirSync(join(repo, ".deps/ffmpeg"), { recursive: true });
    writeFileSync(join(repo, ".deps/ffmpeg/ffprobe"), "x");
    expect(resolveTool("ffprobe", { PATH: join(tmp, "nope") }, repo)).toBeUndefined();
  });
});

describe("findOnPathSync", () => {
  it("только абсолютные каталоги PATH, только исполняемые файлы", () => {
    exe(join(tmp, "b", "tool"));
    writeFileSync(join(tmp, "plain"), "x");
    expect(findOnPathSync("tool", `rel:${join(tmp, "a")}:${join(tmp, "b")}`)).toBe(join(tmp, "b", "tool"));
    expect(findOnPathSync("plain", tmp)).toBeUndefined();
  });
});

describe("isDepsNode", () => {
  it("node внутри <корень .deps>/node — да, nvm — нет", () => {
    expect(isDepsNode(join(repo, ".deps/node/bin/node"), {}, repo)).toBe(true);
    expect(isDepsNode("/Users/u/.nvm/versions/node/v22.21.1/bin/node", {}, repo)).toBe(false);
  });
});

describe("область models папки материалов", () => {
  it("materialsPath('models', 'asr') — веса моделей на SSD", () => {
    const saved = process.env.MS_MATERIALS_ROOT;
    delete process.env.MS_MATERIALS_ROOT;
    try {
      expect(materialsPath("models", "asr")).toBe("/Volumes/External SSD/moution-studio-materials/models/asr");
    } finally {
      if (saved !== undefined) process.env.MS_MATERIALS_ROOT = saved;
    }
  });
});
