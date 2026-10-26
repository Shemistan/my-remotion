// Каталог ошибок: ключ на каждый код `JobErrorCodeSchema` и каждый `errors.*` словарей UI
// (сценарий, общий, проекты); `explainError` — вид для карточки ошибки.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { JobErrorCodeSchema } from "@ms/contracts";
import { expect, it } from "vitest";
import { ERROR_CATALOG, explainError } from "../../src/diagnostics/error-catalog.js";

const I18N = fileURLToPath(new URL("../../../web/src/i18n/", import.meta.url));
const errorKeys = (file: string) => [...readFileSync(I18N + file, "utf8").matchAll(/"errors\.([a-z0-9_]+)"/g)].map((m) => m[1]!);

it("каждый код JobErrorCodeSchema есть в каталоге", () => {
  for (const code of JobErrorCodeSchema.options) expect(ERROR_CATALOG[code], code).toBeDefined();
});

it("каждый ключ errors.* словаря сценария (и общего, проектов) есть в каталоге", () => {
  const plan = errorKeys("ru-script-plan.ts");
  expect(plan.length).toBeGreaterThan(5);
  for (const code of [...plan, ...errorKeys("ru.ts"), ...errorKeys("ru-projects.ts")]) expect(ERROR_CATALOG[code], code).toBeDefined();
});

it("Task 45 (fix): коды API таймлайна — в каталоге, их errors.* — в ru-diagnostics", () => {
  const diag = errorKeys("ru-diagnostics.ts");
  for (const code of ["timeline_not_found", "clip_not_found", "override_reason_required", "version_not_approved"]) {
    expect(explainError({ error: code, message: "x" }).unknown, code).toBe(false);
    expect(diag, code).toContain(code);
  }
  for (const code of diag) expect(ERROR_CATALOG[code], code).toBeDefined();
});

it("explainError: задача — заголовок и подсказка кода, действия; этап и сообщение", () => {
  expect(explainError({ code: "stale_process", message: "живы 4242", stage: "orphaned" })).toEqual({
    kind: "job", code: "stale_process", title: "job.errorCode.stale_process", hint: "diagnostics.hint.stale_process",
    actions: ["kill_process", "retry"], message: "живы 4242", stage: "orphaned", unknown: false,
  });
  expect(explainError({ code: "timeline_stale", message: "" }).actions).toEqual(["rebuild_timeline"]);
});

it("explainError: ошибка API — заголовок errors.<код>; неизвестный код — общий", () => {
  expect(explainError({ error: "storage_offline", message: "нет SSD" })).toMatchObject({ kind: "api", title: "errors.storage_offline", actions: ["wait_storage"], unknown: false });
  expect(explainError({ error: "nope_code", message: "x" })).toMatchObject({ title: "errors.generic", unknown: true, actions: ["open_logs"] });
});
