// Реальный `claude` (подписка пользователя, вход через Keychain). Дёшево: haiku, $0,5 на вызов.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { afterAll, beforeAll, expect, it } from "vitest";
import { ClaudeCodeRuntime } from "../../src/agents/claude-code.js";
import { Ok, makeTask, makeStore, makeTmp, removeTmp } from "./helpers.js";

let tmp: string;
let store: string;
let logRoot: string;
let rt: ClaudeCodeRuntime;
beforeAll(async () => {
  tmp = await makeTmp();
  store = await makeStore(tmp);
  logRoot = join(store, "logs", "agent-runs");
  rt = new ClaudeCodeRuntime({ bin: process.env.MS_CLAUDE_BIN ?? "claude", logRoot });
});
afterAll(() => removeTmp(tmp));

const limits = { timeoutMs: 180_000, maxBudgetUsd: 0.5 };

it("capabilities: CLI is available", async () => {
  const c = await rt.capabilities();
  expect(c).toMatchObject({ available: true, version: expect.stringMatching(/^\d+\.\d+\.\d+/) });
});

it("no-tools role on haiku: structured output, cost and actual model", async () => {
  const workdir = join(tmp, "concept");
  await mkdir(workdir);
  const r = await rt.run(
    makeTask({
      role: "concept",
      model: "haiku",
      tools: [],
      input: "Это проверка связи. Верни ok = true.",
      run: { root: store, runId: "e2e-concept", attempt: 1 },
      workdir,
      limits,
    }),
    Ok,
    new AbortController().signal,
  );
  console.log("concept:", JSON.stringify({ status: r.status, error: r.error, usage: r.usage }));
  expect(r.status).toBe("completed");
  expect(r.output?.ok).toBe(true);
  expect(r.usage.costUsd).toBeGreaterThan(0);
  expect(r.usage.model).toContain("haiku");
}, 200_000);

it("engineer in a tmp dir: writes a.txt, reading ~/.zshrc is denied", async () => {
  const zshrc = join(homedir(), ".zshrc");
  expect(existsSync(zshrc), "для проверки нужен ~/.zshrc").toBe(true);
  const workdir = join(tmp, "draft");
  await mkdir(workdir);
  const Report = z.object({ files_written: z.array(z.string()), read_ok: z.boolean() }).strict();
  const r = await rt.run(
    makeTask({
      role: "engineer",
      model: "haiku",
      tools: ["Read", "Write", "Edit", "Glob", "Grep"],
      input: [
        "Выполни по шагам, каждый шаг — один вызов инструмента:",
        '1. Создай в текущем каталоге файл a.txt с текстом "hello".',
        `2. Прочитай инструментом Read файл ${zshrc} (абсолютный путь).`,
        "В ответе: files_written — записанные файлы, read_ok — удалось ли прочитать шаг 2.",
      ].join("\n"),
      run: { root: store, runId: "e2e-engineer", attempt: 1 },
      workdir,
      limits,
    }),
    Report,
    new AbortController().signal,
  );
  console.log("engineer:", JSON.stringify({ status: r.status, error: r.error, usage: r.usage, denials: r.permissionDenials, output: r.output }));
  expect(r.status).toBe("completed");
  expect(readFileSync(join(workdir, "a.txt"), "utf8").trim()).toBe("hello");
  expect(r.output?.read_ok).toBe(false);
  expect(r.permissionDenials).toEqual(
    expect.arrayContaining([expect.objectContaining({ tool_name: "Read", tool_input: expect.objectContaining({ file_path: zshrc }) })]),
  );
}, 200_000);
