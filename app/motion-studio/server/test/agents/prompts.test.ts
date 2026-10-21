// Системные промпты ролей (M8): partials `{{> имя}}` подставляются до модели; в модель
// не уходит ни одной сырой вставки, ни ссылки на устаревший эксперимент.
import { globSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { spawnTracked } from "@ms/core";
import { ClaudeCodeRuntime } from "../../src/agents/claude-code.js";
import { PROMPTS_DIR, loadPrompt } from "../../src/agents/prompts.js";
import { ROLES } from "../../src/agents/runtime.js";
import { Ok, fx, makeStore, makeTask, makeTmp, removeTmp } from "./helpers.js";

const APP = fileURLToPath(new URL("../../../", import.meta.url));

let tmp: string;
beforeEach(async () => (tmp = await makeTmp()));
afterEach(() => removeTmp(tmp));

describe("loadPrompt", () => {
  it("engineer: контракт сцены и рубрика подставлены, вставок не осталось", () => {
    const p = loadPrompt("engineer");
    expect(p).toContain("ScenePropsBaseSchema");
    expect(p).toContain("Рубрика качества");
    expect(p).not.toContain("{{>");
  });

  it("visual_qa, motion_director: рубрика подставлена; concept — без вставок", () => {
    for (const role of ["visual_qa", "motion_director"] as const) {
      expect(loadPrompt(role), role).toContain("Рубрика качества");
      expect(loadPrompt(role), role).not.toContain("{{>");
    }
    expect(loadPrompt("concept")).toContain("kb_queries");
    expect(loadPrompt("concept")).not.toContain("{{>");
  });

  it("неизвестный partial — ошибка с именем, а не сырая вставка в модель", async () => {
    const dir = join(tmp, "prompts");
    await mkdir(join(dir, "partials"), { recursive: true });
    await writeFile(join(dir, "engineer.md"), "# Роль\n{{> nope}}\n");
    expect(() => loadPrompt("engineer", dir)).toThrow(/partial.*nope/);
  });

  it("вставки внутри partial тоже подставляются; цикл — ошибка", async () => {
    const dir = join(tmp, "prompts");
    await mkdir(join(dir, "partials"), { recursive: true });
    await writeFile(join(dir, "concept.md"), "A {{> one}} B");
    await writeFile(join(dir, "partials", "one.md"), "[{{> two}}]\n");
    await writeFile(join(dir, "partials", "two.md"), "два\n");
    expect(loadPrompt("concept", dir)).toBe("A [два] B");
    await writeFile(join(dir, "partials", "two.md"), "{{> one}}");
    expect(() => loadPrompt("concept", dir)).toThrow(/цикл/);
  });

  it("промпт есть у каждой роли пайплайна генерации", () => {
    for (const role of ROLES.filter((r) => r !== "edit_planner")) expect(loadPrompt(role).length, role).toBeGreaterThan(500);
  });

  it("ни один промпт не ссылается на устаревший эксперимент", () => {
    const files = globSync("prompts/**/*.md", { cwd: APP });
    expect(files.length).toBeGreaterThanOrEqual(6);
    for (const f of files) expect(readFileSync(join(APP, f), "utf8"), f).not.toMatch(/aiplatform|ai-platform\/.*motion/);
  });

  it("промпты без рецептов под приёмочные сцены: окно головы считает пайплайн, ореол — kit, примеры Concept — не из Test 1/2", () => {
    const director = loadPrompt("motion_director");
    expect(director).not.toMatch(/⌈0\.12|0\.12 ×/);
    expect(director).toMatch(/отвергнут/);
    const engineer = loadPrompt("engineer");
    expect(engineer).not.toMatch(/radial-gradient\(closest-side|highlightLast/);
    expect(engineer).toMatch(/<Emphasis/);
    expect(engineer).toMatch(/pulseArrival/);
    const concept = loadPrompt("concept");
    expect(concept).not.toMatch(/1 000 000|оркестратор|линейный график роста|анимированный счётчик/i);
  });

  it("версия motion-kit в промптах и справке = MOTION_KIT_VERSION", () => {
    const version = /MOTION_KIT_VERSION = "([\d.]+)"/.exec(readFileSync(join(APP, "render/src/motion-kit/index.ts"), "utf8"))?.[1];
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(readFileSync(join(APP, "render/src/motion-kit/API.md"), "utf8")).toMatch(new RegExp(`^# @ms/motion-kit ${version!.replace(/\./g, "\\.")} `));
    for (const f of globSync("prompts/**/*.md", { cwd: APP })) {
      for (const m of readFileSync(join(APP, f), "utf8").matchAll(/motion-kit\s+(\d+\.\d+(?:\.\d+)?)/g)) expect(m[1], f).toBe(version);
    }
  });

  it("в промптах и справке kit нет лексики приёмочных и отложенных запросов (примеры — из нейтральных областей)", () => {
    // слова запросов, на которых проверяется пайплайн: пример с ними — рецепт под тест
    const LEAK = ["релиз", "монолит", "микросервис", "оркестратор", "ai-агент", "кэш", "промах", "попадани", "бюджет", "веб-поиск",
      "калькулятор", "заказ", "склад", "мобильн", "трафик", "очеред", "пять вех", "redis", "gen-cache", "gen-compare", "gen-timeline"];
    const NUM = /(?<![\d ])(10 000|1 000 000|84 000|×100|×24|2015|2025)(?![\d])/;
    const files = [...globSync("prompts/**/*.md", { cwd: APP }), "render/src/motion-kit/API.md"];
    for (const f of files) {
      const text = readFileSync(join(APP, f), "utf8").toLowerCase();
      for (const w of LEAK) expect(new RegExp(`(?<![а-яёa-z])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "u").test(text), `${f}: «${w}»`).toBe(false);
      expect(text.match(NUM)?.[0], f).toBeUndefined();
    }
  });

  it("рубрика пронумерована по порядку", () => {
    const rubric = readFileSync(join(APP, "prompts/partials/quality-rubric.md"), "utf8");
    const nums = [...rubric.matchAll(/^(\d+)\. /gm)].map((m) => Number(m[1]));
    expect(nums).toEqual(nums.map((_, i) => i + 1));
  });

  it("Director учит kit 0.3 по смыслу: заголовок, фон, потоки, счёт событий, статусы, данные, скорость, иерархия, акцент", () => {
    const d = loadPrompt("motion_director");
    for (const x of ["title_mode", "background", "focus", "count", "repeat", "travel", "useArrivalCount", "StatusChip", "DataToken", "LatencyRace", "SceneTitle", "size: \"h2\"", "overlay", "slot"]) expect(d, x).toContain(x);
    expect(d).toMatch(/repeat[^\n]*по умолчанию[^\n]*true|по умолчанию[^\n]*repeat: true/);
    expect(d).toMatch(/не больше одного pill/i);
    expect(d).not.toMatch(/Без поля камера стоит — это нормальный выбор/);
    const e = loadPrompt("engineer");
    for (const x of ["SceneTitle", "composition.background", "seed", "useArrivalCount", "StatusChip", "DataToken", "LatencyRace", "slot"]) expect(e, x).toContain(x);
    const c = loadPrompt("concept");
    expect(c).toMatch(/без имён/);
  });

  it("PROMPTS_DIR — каталог prompts/ приложения", () => {
    expect(PROMPTS_DIR.replace(/\/$/, "")).toBe(join(APP, "prompts"));
  });
});

describe("ClaudeCodeRuntime: системный промпт через promptLoader", () => {
  const capture = () => {
    const seen: string[][] = [];
    const spawn: typeof spawnTracked = async (_root, _ref, _cmd, args) => {
      seen.push(args);
      return { code: 0, signal: null, stdout: fx("success.json"), stderr: "", orphaned: false };
    };
    return { seen, spawn };
  };
  const promptMdOf = (args: string[]) => args[args.indexOf("--append-system-prompt") + 1] ?? "";

  it("с promptLoader: loadPrompt в модель уходит промпт без {{>", async () => {
    const store = await makeStore(tmp);
    const workdir = join(tmp, "draft");
    await mkdir(workdir);
    const { seen, spawn } = capture();
    const rt = new ClaudeCodeRuntime({ bin: "/bin/echo", logRoot: join(store, "logs", "agent-runs"), promptLoader: loadPrompt, spawn });
    const r = await rt.run(makeTask({ role: "visual_qa", input: "x", run: { root: store, runId: "r1", attempt: 1 }, workdir }), Ok, new AbortController().signal);
    expect(r.status).toBe("completed");
    const sys = promptMdOf(seen[0]!);
    expect(sys).toContain("Рубрика качества");
    expect(sys).not.toContain("{{>");
  });

  it("promptsDir без promptLoader тоже подставляет partials (сырая вставка в модель не уходит)", async () => {
    const store = await makeStore(tmp);
    const workdir = join(tmp, "draft");
    await mkdir(workdir);
    const { seen, spawn } = capture();
    const rt = new ClaudeCodeRuntime({ bin: "/bin/echo", logRoot: join(store, "logs", "agent-runs"), promptsDir: PROMPTS_DIR, spawn });
    await rt.run(makeTask({ role: "engineer", input: "x", run: { root: store, runId: "r2", attempt: 1 }, workdir, tools: ["Read"] }), Ok, new AbortController().signal);
    expect(promptMdOf(seen[0]!)).toContain("ScenePropsBaseSchema");
    expect(promptMdOf(seen[0]!)).not.toContain("{{>");
  });
});
