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
