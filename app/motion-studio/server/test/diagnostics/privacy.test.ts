// Приватность журнала и архива (ревью Task 48): тексты сценария пользователя (сообщения и данные
// событий script.* и событий с текстом пользователя) скрываются, ids и коды остаются; абсолютные
// пути (хранилище, дом, чужой /Users/<имя>, том хранилища /Volumes/<том>) маскируются.
import { expect, it } from "vitest";
import { hasUserText, maskExport, stripEvent, stripLogEntry, USER_TEXT_HIDDEN } from "../../src/diagnostics/privacy.js";

it("hasUserText: все события script.* и события с текстом пользователя в прочих задачах", () => {
  expect(hasUserText("quote_autofixed", "script.plan")).toBe(true);
  expect(hasUserText("failed", "script.package")).toBe(true);
  expect(hasUserText("log", "script.plan")).toBe(true);
  for (const k of ["quote_autofixed", "skip_dropped", "patch_scene_dropped", "fill_failed", "agent_retry", "agent_retry_failed",
    "agent_retry_kept_first", "hotwords_truncated", "asr_output_rejected", "semantic_rejected", "plan_problems"]) {
    expect(hasUserText(k, undefined), k).toBe(true);
  }
  expect(hasUserText("failed", "playground.generate")).toBe(false);
  expect(hasUserText("shots", "footage.analyze")).toBe(false);
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
