// diagnosticBundle: zip в `<хранилище>/diagnostics/`: журналы за 7 дней, doctor.json,
// PRAGMA user_version, последние 2000 job_events, boot_reports; без медиа и превью; промпты —
// только по флагу; всё через redact.
import { mkdir, readdir, utimes, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import * as bootReports from "../../src/db/repos/boot-reports.js";
import * as jobs from "../../src/db/repos/jobs.js";
import { tx } from "../../src/db/tx.js";
import { diagnosticBundle } from "../../src/diagnostics/bundle.js";
import { createLogger } from "../../src/diagnostics/logger.js";
import { type Api, makeApi, seedVersion } from "../api/helpers.js";
import { readZip, zipEntries, zipText } from "./zip-read.js";

let api: Api;
beforeEach(async () => {
  api = await makeApi();
});
afterEach(async () => {
  await api.close();
});

const doctor = async () => ({ ok: true, rows: [{ name: "node", ok: true, status: "ok", detail: "22.21.1 ANTHROPIC_API_KEY=sk-ant-api03-LEAK" }], created_at: "2026-10-25T10:00:00.000Z" });

async function put(rel: string, text: string, mtime?: Date): Promise<void> {
  const p = join(api.core.root, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, text);
  if (mtime) await utimes(p, mtime, mtime);
}

async function seed(): Promise<void> {
  const db = api.core.db;
  await seedVersion(api, { previewBytes: 2000 });
  const log = createLogger(api.core.root);
  log.error("claude упал: Bearer tok.en sk-ant-api03-SECRET", { job_id: "job_x" });
  await log.flush();
  await put("logs/server-2020-01-01.jsonl", '{"ts":"2020-01-01T00:00:00.000Z","level":"info","msg":"старый"}\n', new Date("2020-01-02"));
  await put("logs/agent-runs/job_x/a1-engineer-1/prompt.md", "секретный промпт пользователя");
  await put("logs/agent-runs/job_x/a1-engineer-1/stderr.log", "warn: token sk-ant-api03-STDERR");
  await put("logs/agent-runs/job_x/a1-engineer-1/stdout.json", '{"result":"ok"}');
  await put("logs/agent-runs/job_x/a1-engineer-1/frame.mp4", "не медиа в архиве");
  jobs.insert(db, { id: "job_ev", type: "script.plan", project_id: "playground", input: {}, status: "failed" });
  tx(db, () => {
    for (let i = 0; i < 2005; i++) api.core.events.emit(db, { job_id: "job_ev", level: "info", kind: "log", message: `событие ${i}` });
  });
  bootReports.insert(db, { id: "boot_1", created_at: "2026-10-25T09:00:00.000Z", crashed: true, report: { note: "Bearer zzz" } });
}

it("состав архива, без медиа и промптов, без секретов", async () => {
  await seed();
  const b = await diagnosticBundle(api.core, { includePrompts: false, doctor, now: () => new Date("2026-10-25T10:00:00Z") });
  expect(b.path.startsWith(join(api.core.root, "diagnostics") + "/")).toBe(true);
  expect(b.bytes).toBeGreaterThan(0);
  const names = zipEntries(b.path);
  expect(names).toEqual(expect.arrayContaining(["doctor.json", "db.json", "job_events.jsonl", "boot_reports.json", "agent-runs/job_x/a1-engineer-1/stderr.log"]));
  expect(names.some((n) => /^logs\/server-\d{4}-\d{2}-\d{2}\.jsonl$/.test(n))).toBe(true);
  expect(names).not.toContain("logs/server-2020-01-01.jsonl"); // старше 7 дней
  expect(names.some((n) => n.endsWith(".mp4") || n.includes("prompt") || n.includes("preview"))).toBe(false);
  const text = zipText(b.path);
  expect(text).not.toMatch(/sk-ant-/);
  expect(text).not.toMatch(/tok\.en|zzz/);
  const z = readZip(b.path);
  expect(JSON.parse(z.get("db.json")!.toString())).toMatchObject({ user_version: expect.any(Number) });
  const events = z.get("job_events.jsonl")!.toString().trim().split("\n");
  expect(events).toHaveLength(2000);
  expect(JSON.parse(events.at(-1)!)).toMatchObject({ message: "событие 2004" });
});

it("includePrompts: промпты агентов попадают в архив (тоже через redact)", async () => {
  await seed();
  const b = await diagnosticBundle(api.core, { includePrompts: true, doctor });
  expect(zipEntries(b.path)).toContain("agent-runs/job_x/a1-engineer-1/prompt.md");
  expect(readZip(b.path).get("agent-runs/job_x/a1-engineer-1/prompt.md")!.toString()).toBe("секретный промпт пользователя");
});

it("два архива подряд — разные имена", async () => {
  const now = () => new Date("2026-10-25T10:00:00Z");
  const a = await diagnosticBundle(api.core, { includePrompts: false, doctor, now });
  const b = await diagnosticBundle(api.core, { includePrompts: false, doctor, now });
  expect(a.path).not.toBe(b.path);
  expect((await readdir(join(api.core.root, "diagnostics"))).length).toBe(2);
});
