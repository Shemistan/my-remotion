// diagnosticBundle: zip в `<хранилище>/diagnostics/`: журналы за 7 дней, doctor.json,
// PRAGMA user_version, последние 2000 job_events, boot_reports; без медиа и превью; промпты —
// только по флагу; всё через redact.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { appendFile, mkdir, readdir, utimes, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import * as bootReports from "../../src/db/repos/boot-reports.js";
import * as jobs from "../../src/db/repos/jobs.js";
import { tx } from "../../src/db/tx.js";
import { BUNDLE_KEEP, diagnosticBundle } from "../../src/diagnostics/bundle.js";
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

const QUOTE = "Мы выросли втрое за квартал";
const doctor = async () => ({ ok: true, rows: [{ name: "node", ok: true, status: "ok", detail: `22.21.1 ${homedir()}/.nvm/node ANTHROPIC_API_KEY=sk-ant-api03-LEAK` }], created_at: "2026-10-25T10:00:00.000Z" });

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
  jobs.insert(db, { id: "job_ev", type: "playground.generate", project_id: "playground", input: {}, status: "failed" });
  tx(db, () => {
    for (let i = 0; i < 2005; i++) api.core.events.emit(db, { job_id: "job_ev", level: "info", kind: "log", message: `событие ${i}` });
  });
  bootReports.insert(db, { id: "boot_1", created_at: "2026-10-25T09:00:00.000Z", crashed: true, report: { note: "Bearer zzz.9", path: `${api.core.root}/studio.db` } });
  // сценарий пользователя: событие script.plan с цитатой и старая строка журнала с ней же
  jobs.insert(db, { id: "job_sc", type: "script.plan", project_id: "playground", input: {}, status: "completed" });
  tx(db, () => {
    api.core.events.emit(db, { job_id: "job_sc", level: "warn", kind: "quote_autofixed", message: `s3: ${QUOTE} — исправлено`, data: { item_id: "s3", code: "quote_autofixed", quote: QUOTE } });
    api.core.events.emit(db, { job_id: "job_ev", level: "warn", kind: "agent_retry", message: `ответ не прошёл схему: ${QUOTE}` });
    api.core.events.emit(db, { job_id: "job_ev", level: "info", kind: "log", message: `файл ${api.core.root}/projects/p/a.mp4, ${homedir()}/Movies/b.mov, /Users/ivan/c.mov` });
  });
  await appendFile(join(api.core.root, "logs", `server-${new Date().toISOString().slice(0, 10)}.jsonl`),
    JSON.stringify({ ts: new Date().toISOString(), level: "warn", msg: `s3: ${QUOTE}`, job_id: "job_sc", kind: "quote_autofixed", data: { item_id: "s3" } }) + "\n");
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
  expect(text).not.toMatch(/tok\.en|zzz\.9/);
  // без флага — ни цитаты сценария, ни абсолютных путей
  expect(text).not.toContain(QUOTE);
  expect(text).not.toContain(api.core.root);
  expect(text).not.toMatch(/\/Users\/(?!…)/);
  expect(text).toContain('"kind":"quote_autofixed"');
  expect(text).toContain('"code":"quote_autofixed"');
  const z = readZip(b.path);
  expect(JSON.parse(z.get("db.json")!.toString())).toMatchObject({ user_version: expect.any(Number) });
  const events = z.get("job_events.jsonl")!.toString().trim().split("\n");
  expect(events).toHaveLength(2000);
  expect(events.map((l) => JSON.parse(l) as { message: string }).some((e) => e.message === "событие 2004")).toBe(true);
  expect(JSON.parse(events.find((l) => l.includes('"quote_autofixed"'))!)).toMatchObject({ job_id: "job_sc", kind: "quote_autofixed", level: "warn", data: { item_id: "s3", code: "quote_autofixed" } });
  expect(JSON.parse(z.get("manifest.json")!.toString())).toMatchObject({ include_prompts: false, truncated: [] });
});

it("includePrompts: промпты агентов и тексты событий попадают в архив (тоже через redact, без путей)", async () => {
  await seed();
  const b = await diagnosticBundle(api.core, { includePrompts: true, doctor });
  expect(zipEntries(b.path)).toContain("agent-runs/job_x/a1-engineer-1/prompt.md");
  expect(readZip(b.path).get("agent-runs/job_x/a1-engineer-1/prompt.md")!.toString()).toBe("секретный промпт пользователя");
  const text = zipText(b.path);
  expect(text).toContain(QUOTE);
  expect(text).not.toContain(api.core.root);
  expect(text).not.toMatch(/\/Users\/(?!…)/);
});

it("архив читает сторонний распаковщик: CRC записей сходятся", async () => {
  await seed();
  const b = await diagnosticBundle(api.core, { includePrompts: false, doctor });
  readZip(b.path, { verifyCrc: true }); // бросает при несовпадении CRC
  if (existsSync("/usr/bin/unzip")) expect(execFileSync("/usr/bin/unzip", ["-tq", b.path]).toString()).toMatch(/No errors detected/);
});

it("лимит размера: лишние записи не попадают, manifest их перечисляет", async () => {
  await seed();
  const b = await diagnosticBundle(api.core, { includePrompts: false, doctor, maxBytes: 2_000 });
  const z = readZip(b.path);
  const manifest = JSON.parse(z.get("manifest.json")!.toString()) as { truncated: string[]; max_bytes: number; entries: string[] };
  expect(manifest.max_bytes).toBe(2_000);
  expect(manifest.truncated).toContain("job_events.jsonl");
  expect([...z.keys()]).not.toContain("job_events.jsonl");
  expect(manifest.entries).toEqual([...z.keys()].filter((n) => n !== "manifest.json"));
});

it(`старые архивы удаляются: остаются последние ${BUNDLE_KEEP}`, async () => {
  for (let i = 1; i <= 7; i++) await put(`diagnostics/diag-2026010${i}T000000.zip`, "PK", new Date(`2026-01-0${i}T00:00:00Z`));
  await put("diagnostics/other.txt", "не архив");
  const b = await diagnosticBundle(api.core, { includePrompts: false, doctor });
  const left = (await readdir(join(api.core.root, "diagnostics"))).sort();
  expect(left).toHaveLength(BUNDLE_KEEP + 1);
  expect(left).toContain(b.name);
  expect(left).toContain("other.txt");
  expect(left).not.toContain("diag-20260101T000000.zip");
  expect(left).not.toContain("diag-20260103T000000.zip");
  expect(left).toContain("diag-20260104T000000.zip");
});

it("два архива подряд — разные имена", async () => {
  const now = () => new Date("2026-10-25T10:00:00Z");
  const a = await diagnosticBundle(api.core, { includePrompts: false, doctor, now });
  const b = await diagnosticBundle(api.core, { includePrompts: false, doctor, now });
  expect(a.path).not.toBe(b.path);
  expect((await readdir(join(api.core.root, "diagnostics"))).length).toBe(2);
});
