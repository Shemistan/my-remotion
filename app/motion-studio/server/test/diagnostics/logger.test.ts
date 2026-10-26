// Журнал сервера: JSONL `logs/server-YYYY-MM-DD.jsonl`, корреляционные поля, redact, ротация
// 10 МБ × 10 файлов, чтение с фильтрами (`GET /api/logs`).
import { readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createLogger, type Logger, logFiles, readLogs } from "../../src/diagnostics/logger.js";
import { makeStore, removeStore, type TestStore } from "../db/helpers.js";

// каталог журнала — только через safeMkdir: нужен настоящий корень хранилища с маркером
let s: TestStore;
let root: string;
beforeEach(async () => {
  s = await makeStore("ms-logger-");
  root = s.root;
});
afterEach(async () => {
  await removeStore(s);
});

async function lastLine(dir: string): Promise<Record<string, unknown>> {
  const files = await logFiles(dir);
  const lines = (await readFile(files.at(-1)!, "utf8")).trim().split("\n");
  return JSON.parse(lines.at(-1)!) as Record<string, unknown>;
}

async function writeMany(log: Logger, bytes: number): Promise<void> {
  const chunk = "x".repeat(8 * 1024);
  for (let n = 0; n < bytes; n += chunk.length) log.info(chunk);
  await log.flush();
}

it("запись: ts, level, msg и корреляционные поля; файл по дате", async () => {
  const log = createLogger(root, { now: () => new Date("2026-10-25T10:00:00Z") });
  log.info("render", { job_id: "job_1", project_id: "p1" });
  await log.flush();
  expect(await lastLine(root)).toMatchObject({ job_id: "job_1", project_id: "p1", level: "info", msg: "render", ts: "2026-10-25T10:00:00.000Z" });
  expect((await readdir(join(root, "logs"))).sort()).toEqual(["server-2026-10-25.jsonl"]);
});

it("каждая запись проходит redact (сообщение и данные)", async () => {
  const log = createLogger(root);
  log.error("claude: Bearer abc.def", { job_id: "job_2", data: { stderr: "ANTHROPIC_API_KEY=sk-ant-api03-SECRET" } });
  await log.flush();
  const text = await readFile((await logFiles(root))[0]!, "utf8");
  expect(text).not.toMatch(/sk-ant-|abc\.def/);
  expect(await lastLine(root)).toMatchObject({ msg: "claude: Bearer [скрыто]", data: { stderr: "ANTHROPIC_API_KEY=[скрыто]" } });
});

it("ротация: 11 МБ → больше одного файла, не больше 10", async () => {
  const log = createLogger(root);
  await writeMany(log, 11 * 1024 * 1024);
  const files = await logFiles(root);
  expect(files.length).toBeGreaterThan(1);
  expect(files.length).toBeLessThanOrEqual(10);
});

it("ротация: старые файлы удаляются сверх лимита, текущий — последний", async () => {
  const log = createLogger(root, { maxBytes: 4096, maxFiles: 3 });
  for (let i = 0; i < 100; i++) log.info(`строка ${i} ${"y".repeat(200)}`);
  await log.flush();
  const files = await logFiles(root);
  expect(files.length).toBe(3);
  expect(await lastLine(root)).toMatchObject({ msg: expect.stringMatching(/^строка 99 /) });
});

it("readLogs: уровень (не ниже), задача, проект, since, limit; по времени", async () => {
  let t = Date.parse("2026-10-25T10:00:00Z");
  const log = createLogger(root, { now: () => new Date((t += 1000)) });
  log.debug("d", { job_id: "job_a", project_id: "p1" });
  log.info("i", { job_id: "job_a", project_id: "p1" });
  log.warn("w", { job_id: "job_b", project_id: "p2" });
  log.error("e", { job_id: "job_a", project_id: "p1" });
  await log.flush();
  expect((await readLogs(root, {})).map((e) => e.msg)).toEqual(["d", "i", "w", "e"]);
  expect((await readLogs(root, { level: "warn" })).map((e) => e.msg)).toEqual(["w", "e"]);
  expect((await readLogs(root, { jobId: "job_a" })).map((e) => e.msg)).toEqual(["d", "i", "e"]);
  expect((await readLogs(root, { projectId: "p2" })).map((e) => e.msg)).toEqual(["w"]);
  expect((await readLogs(root, { since: "2026-10-25T10:00:03Z" })).map((e) => e.msg)).toEqual(["w", "e"]);
  expect((await readLogs(root, { limit: 2 })).map((e) => e.msg)).toEqual(["w", "e"]);
});

it("сбой записи (хранилище пропало) не бросает", async () => {
  const log = createLogger(join(root, "нет"));
  log.info("x");
  await expect(log.flush()).resolves.toBeUndefined();
  const live = createLogger(root);
  await rm(root, { recursive: true, force: true });
  live.info("y");
  await expect(live.flush()).resolves.toBeUndefined();
});
