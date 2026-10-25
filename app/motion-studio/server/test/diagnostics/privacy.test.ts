// Приватность журнала и архива (ревью Task 48): тексты сценария пользователя (сообщения и данные
// событий script.* и событий с текстом пользователя) скрываются, ids и коды остаются; абсолютные
// пути (хранилище, дом, чужой /Users/<имя>, том хранилища /Volumes/<том>) маскируются.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { JobStatusSchema } from "@ms/contracts";
import { expect, it } from "vitest";
import { HIDDEN_KINDS, hasUserText, maskExport, SAFE_KINDS, stripEvent, stripLogEntry, USER_TEXT_HIDDEN } from "../../src/diagnostics/privacy.js";

it("allowlist: скрыто всё, кроме SAFE_KINDS (в т. ч. неизвестный вид и запись без вида)", () => {
  for (const k of ["quote_autofixed", "skip_dropped", "patch_scene_dropped", "fill_failed", "agent_retry", "failed", "log", "brand_new_kind"]) {
    expect(hasUserText(k), k).toBe(true);
  }
  expect(hasUserText(undefined)).toBe(true);
  for (const k of ["progress", "started", "completed", "shots"]) expect(hasUserText(k), k).toBe(false);
  expect([...SAFE_KINDS].filter((k) => HIDDEN_KINDS.has(k))).toEqual([]);
});

// ---- страж: каждый вид события, который эмитит код, имеет решение ----

const SRC = fileURLToPath(new URL("../../src/", import.meta.url));

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sources(join(dir, e.name)) : e.name.endsWith(".ts") ? [join(dir, e.name)] : []);
}

/** Вызовы с литеральным видом события (все формы эмиссии в server/src). */
const LITERAL = [
  /\bctx\.emit\(\s*"([a-z_]+)"/g, // обработчики задач
  /\bthis\.emit\(job\.id,\s*"[a-z]+",\s*"([a-z_]+)"/g, // раннер
  /\bevent\((?:job\.)?id,\s*"[a-z]+",\s*"([a-z_]+)"/g, // восстановление
  /\bjob_id:[^}\n]*?\bkind:\s*"([a-z_]+)"/g, // объект события `{ job_id, level, kind, message }`
  /\blogger\.\w+\([^;]*?\{\s*kind:\s*"([a-z_]+)"/g, // журнал сервера (не события задач)
];
/** Места с нелитеральным видом — известны поимённо; вид у раннера — статус задачи. */
const DYNAMIC = [
  "emit(kind: string, message: string, data?: unknown): void;",
  "emit(db: Db, ev: JobEventInput): JobEventDto {",
  "private emit(jobId: string,",
  "emit: (kind, message, data) => this.emit(job.id, \"info\", kind, message, data)",
  // Task 49a: тело ctx.emit раннера с пульсом сторожа прогресса
  "this.emit(job.id, \"info\", kind, message, data);",
  "final.status, final.error?.message ?? final.status)",
  "this.events.emit(this.db, { job_id: jobId, level, kind, message",
  "deps.events.emit(db, ev)",
  "events.emit(db, ev)",
];

it("страж: каждый вид события в коде — в SAFE_KINDS или HIDDEN_KINDS; новые формы эмиссии известны", () => {
  const kinds = new Set<string>(JobStatusSchema.options); // runner: kind = final.status
  const unknownSites: string[] = [];
  for (const file of sources(SRC)) {
    const text = readFileSync(file, "utf8");
    for (const re of LITERAL) for (const m of text.matchAll(re)) kinds.add(m[1]!);
    text.split("\n").forEach((line, i) => {
      if (!/(?:\bemit|(?<![\w.])event)\(/.test(line) || line.trim().startsWith("//") || line.trim().startsWith("*")) return;
      if (LITERAL.some((re) => new RegExp(re.source).test(line))) return;
      if (DYNAMIC.some((d) => line.includes(d))) return;
      unknownSites.push(`${file.slice(SRC.length)}:${i + 1}: ${line.trim()}`);
    });
  }
  expect(unknownSites, "новая форма эмиссии события: добавьте её в LITERAL/DYNAMIC стража").toEqual([]);
  expect(kinds.size).toBeGreaterThan(60);
  const undecided = [...kinds].filter((k) => !SAFE_KINDS.has(k) && !HIDDEN_KINDS.has(k)).sort();
  expect(undecided, "вид события без решения: внесите в SAFE_KINDS (нет свободного текста) или HIDDEN_KINDS").toEqual([]);
});

it("stripEvent: без сообщения и текста; kind, level, ids и коды остаются", () => {
  const ev = {
    id: 7, job_id: "job_1", ts: "2026-10-25T10:00:00.000Z", level: "warn" as const, kind: "quote_autofixed",
    message: "s3: цитата «Мы выросли втрое» исправлена",
    data: { item_id: "s3", code: "quote_autofixed", quote: "Мы выросли втрое", count: 2, nested: { text: "x" } },
  };
  const out = stripEvent(ev);
  expect(out).toEqual({ id: 7, job_id: "job_1", ts: ev.ts, level: "warn", kind: "quote_autofixed", message: USER_TEXT_HIDDEN, data: { item_id: "s3", code: "quote_autofixed", count: 2 } });
  expect(JSON.stringify(out)).not.toContain("втрое");
  const noData = stripEvent({ ...ev, data: undefined });
  expect(noData).not.toHaveProperty("data");
});

it("stripLogEntry: msg и data скрыты, корреляция и kind остаются", () => {
  const e = { ts: "2026-10-25T10:00:00.000Z", level: "info" as const, msg: "s1: пропуск агента отброшен — «текст»", job_id: "job_1", project_id: "p1", kind: "skip_dropped", data: { reason: "too_long" } };
  expect(stripLogEntry(e)).toEqual({ ...e, msg: USER_TEXT_HIDDEN, data: { reason: "too_long" } });
});

it("maskExport: хранилище, дом, чужой /Users/<имя>, том хранилища", () => {
  const root = "/Volumes/External SSD/moution-studio-materials/store";
  const home = "/Users/stalyzade";
  const v = maskExport({
    a: `${root}/projects/p1/a.mp4`,
    b: [`${home}/Movies/x.mov`, "/Users/ivan/Desktop/y.mov"],
    c: { d: "/Volumes/External SSD/other/clip.mov и ещё" },
    n: 5,
  }, root, home);
  const s = JSON.stringify(v);
  expect(s).not.toMatch(/\/Users\/(?!…)/);
  expect(s).not.toContain("External SSD");
  expect(v).toEqual({ a: "хранилище/projects/p1/a.mp4", b: ["~/Movies/x.mov", "/Users/…/Desktop/y.mov"], c: { d: "/Volumes/…/other/clip.mov и ещё" }, n: 5 });
});
