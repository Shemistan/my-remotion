import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { KnowledgeAdapter } from "../../src/knowledge/adapter.js";

const rec = (o: Record<string, unknown>) => ({
  name: "X", repo: "r", kind: "component", category: "misc", visualizes: "", use_when: "", voiceover_cues: [],
  inputs: "", adaptations: "", patterns: [], compat_flags: [], source_files: ["a.tsx"], docs: [],
  verification: "static-review", remotion_compat: "native", card: "components/r/x.md", license: "MIT (x)", ...o,
});
const jsonl = (rows: object[]) => rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
const repos = JSON.stringify({ repositories: [{ id: "r", url: "u", commit: "abc1234", license: "MIT" }] });

let root: string;
let n = 0;
const fresh = async (rows: object[]) => {
  const dir = join(root, `kb${n++}`);
  await mkdir(join(dir, "compatibility"), { recursive: true });
  await writeFile(join(dir, "capabilities.jsonl"), jsonl(rows));
  await writeFile(join(dir, "repositories.json"), repos);
  return dir;
};
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "kb-reload-"));
});
afterAll(() => rm(root, { recursive: true, force: true }));

describe("перечитывание по mtime", () => {
  it("правка capabilities.jsonl видна в search и getCapability без нового load", async () => {
    const dir = await fresh([rec({ id: "r/a", visualizes: "счётчик" })]);
    const kb = await KnowledgeAdapter.load({ kbRoot: dir, sourceRoot: dir });
    expect(kb.search("счетчик").map((h) => h.view.id)).toEqual(["r/a"]);
    expect(kb.getCapability("r/b")).toBeUndefined();

    const file = join(dir, "capabilities.jsonl");
    await writeFile(file, jsonl([rec({ id: "r/a", visualizes: "счётчик" }), rec({ id: "r/b", visualizes: "счётчик" })]));
    const future = new Date(Date.now() + 5000);
    await utimes(file, future, future);
    expect(kb.getCapability("r/b")).toBeDefined();
    expect(kb.search("счетчик").map((h) => h.view.id).sort()).toEqual(["r/a", "r/b"]);
    expect(kb.size).toBe(2);
  });

  it("results.jsonl: result ok/fail -> rendered-ok/rendered-fail, последняя строка побеждает", async () => {
    const dir = await fresh([rec({ id: "r/a" }), rec({ id: "r/b" })]);
    const kb = await KnowledgeAdapter.load({ kbRoot: dir, sourceRoot: dir });
    expect(kb.getCapability("r/a")!.tested_status).toBe("static-review");
    const file = join(dir, "compatibility", "results.jsonl");
    await writeFile(
      file,
      jsonl([
        { id: "r/a", date: "2026-10-20", remotion: "4.0.537", result: "fail", how: "x", notes: "y" },
        { id: "r/a", date: "2026-10-21", remotion: "4.0.537", result: "ok", how: "x", notes: "" },
        { id: "r/b", result: "fail" },
      ]),
    );
    const t = new Date(Date.now() + 5000);
    await utimes(file, t, t);
    expect(kb.getCapability("r/a")!.tested_status).toBe("rendered-ok");
    expect(kb.getCapability("r/b")!.tested_status).toBe("rendered-fail");
    expect(kb.getCompatibility("r/a").tested_status).toBe("rendered-ok");
  });

  it("results.jsonl с неверным result — понятная ошибка", async () => {
    const dir = await fresh([rec({ id: "r/a" })]);
    await writeFile(join(dir, "compatibility", "results.jsonl"), jsonl([{ id: "r/a", result: "maybe" }]));
    await expect(KnowledgeAdapter.load({ kbRoot: dir, sourceRoot: dir })).rejects.toThrow(/results\.jsonl:1.*r\/a/);
  });
});

describe("ошибки загрузки называют строку и id", () => {
  it("битый JSON", async () => {
    const dir = await fresh([rec({ id: "r/a" })]);
    await writeFile(join(dir, "capabilities.jsonl"), `${JSON.stringify(rec({ id: "r/a" }))}\n{oops\n`);
    await expect(KnowledgeAdapter.load({ kbRoot: dir, sourceRoot: dir })).rejects.toThrow(/capabilities\.jsonl:2.*JSON/);
  });
  it("запись без обязательного поля", async () => {
    const dir = await fresh([rec({ id: "r/a" }), { ...rec({ id: "r/bad" }), voiceover_cues: "не список" }]);
    await expect(KnowledgeAdapter.load({ kbRoot: dir, sourceRoot: dir })).rejects.toThrow(/capabilities\.jsonl:2.*r\/bad.*voiceover_cues/);
  });
  it("дубликат id", async () => {
    const dir = await fresh([rec({ id: "r/a" }), rec({ id: "r/a" })]);
    await expect(KnowledgeAdapter.load({ kbRoot: dir, sourceRoot: dir })).rejects.toThrow(/дубликат id r\/a/);
  });
});

describe("недописанная KB (Task 17): fresh() держит последний исправный индекс", () => {
  const bump = async (file: string, s = 5) => {
    const t = new Date(Date.now() + s * 1000);
    await utimes(file, t, t);
  };
  const load = async (dir: string, warnings: string[]) => KnowledgeAdapter.load({ kbRoot: dir, sourceRoot: dir, onWarn: (m) => warnings.push(m) });

  it("битый JSON во время пересборки — прежняя выдача и предупреждение; исправленная KB подхватывается", async () => {
    const dir = await fresh([rec({ id: "r/a", visualizes: "счётчик" })]);
    const warnings: string[] = [];
    const kb = await load(dir, warnings);
    const file = join(dir, "capabilities.jsonl");
    // пересборка оборвана посреди строки
    await writeFile(file, `${JSON.stringify(rec({ id: "r/a", visualizes: "счётчик" }))}\n{"id": "r/b", "na`);
    await bump(file);
    expect(kb.search("счетчик").map((h) => h.view.id)).toEqual(["r/a"]);
    expect(kb.getCapability("r/a")).toBeDefined();
    expect(warnings.join("\n")).toMatch(/KB.*прежний индекс/);
    // повторные обращения к той же битой KB не множат предупреждения
    kb.search("счетчик");
    expect(warnings).toHaveLength(1);
    await writeFile(file, jsonl([rec({ id: "r/a", visualizes: "счётчик" }), rec({ id: "r/b", visualizes: "счётчик" })]));
    await bump(file, 10);
    expect(kb.search("счетчик").map((h) => h.view.id).sort()).toEqual(["r/a", "r/b"]);
  });

  it("пустой capabilities.jsonl (файл переписывается) — не пустая выдача, а прежний индекс", async () => {
    const dir = await fresh([rec({ id: "r/a", visualizes: "счётчик" })]);
    const warnings: string[] = [];
    const kb = await load(dir, warnings);
    const file = join(dir, "capabilities.jsonl");
    await writeFile(file, "");
    await bump(file);
    expect(kb.search("счетчик").map((h) => h.view.id)).toEqual(["r/a"]);
    expect(kb.size).toBe(1);
    expect(warnings).toHaveLength(1);
  });

  it("пропала карточка, которая была в исправном индексе, — прежний индекс", async () => {
    const dir = await fresh([rec({ id: "r/a", visualizes: "счётчик", card: "components/r/a.md" })]);
    await mkdir(join(dir, "components", "r"), { recursive: true });
    await writeFile(join(dir, "components", "r", "a.md"), "# a\n");
    const warnings: string[] = [];
    const kb = await load(dir, warnings);
    // пересборка: карточки удалены и ещё не записаны, индекс уже новый
    await rm(join(dir, "components"), { recursive: true });
    const file = join(dir, "capabilities.jsonl");
    await writeFile(file, jsonl([rec({ id: "r/a", visualizes: "счётчик новый", card: "components/r/a.md" })]));
    await bump(file);
    expect(kb.getCapability("r/a")!.visualizes).toBe("счётчик");
    expect(warnings.join("\n")).toMatch(/карточ/);
  });
});

describe("поиск по умолчанию — только визуальное (Task 17)", () => {
  it("kind doc и «Не рисует…» / «Своей картинки нет…» не попадают в выдачу; includeNonVisual — попадают", async () => {
    const dir = await fresh([
      rec({ id: "r/chart", kind: "component", visualizes: "график роста" }),
      rec({ id: "r/doc", kind: "doc", visualizes: "график: как настроить" }),
      rec({ id: "r/cfg", kind: "util", visualizes: "Не рисует: конфиг графика" }),
      rec({ id: "r/fonts", kind: "util", visualizes: "Своей картинки нет: шрифты для графика" }),
    ]);
    const kb = await KnowledgeAdapter.load({ kbRoot: dir, sourceRoot: dir });
    expect(kb.search("график").map((h) => h.view.id)).toEqual(["r/chart"]);
    expect(kb.search("график", { includeNonVisual: true }).map((h) => h.view.id).sort()).toEqual(["r/cfg", "r/chart", "r/doc", "r/fonts"]);
  });
});
