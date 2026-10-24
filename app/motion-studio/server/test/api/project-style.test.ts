// StyleBible проекта через API (Task 33): текущая ревизия с историей, контрастом пар цветов,
// проблемами и шрифтами kit; сохранение пользователем — новая ревизия; плохой контраст и не-hex —
// 400 без ревизии; устаревшая база — 409.
import { afterEach, beforeEach, expect, it } from "vitest";
import { type Api, getHeaders, makeApi, okHeaders } from "./helpers.js";
import * as projects from "../../src/db/repos/projects.js";
import * as styles from "../../src/db/repos/styles.js";
import { seedVideoApi } from "./video-helpers.js";

let api: Api;
beforeEach(async () => {
  api = await makeApi();
  await seedVideoApi(api);
});
afterEach(() => api.close());

const put = (body: unknown) => api.inj("PUT", "/api/projects/p1/style", okHeaders, body);
const BASE = { preset: "light-clean", intensity: "balanced", depth: 1 };

it("стиля нет — 404; PUT создаёт r1 пользователя; GET — текущая, история, контраст, шрифты", async () => {
  const none = await api.inj("GET", "/api/projects/p1/style", getHeaders);
  expect(none.statusCode).toBe(404);
  const r = await put({ base: BASE });
  expect(r.statusCode, r.body).toBe(201);
  const dto = r.json();
  expect(dto.current).toMatchObject({ revision: 1, author: "user", base: BASE });
  expect(dto.history).toEqual([expect.objectContaining({ revision: 1, author: "user", parent_revision: null })]);
  expect(dto.contrast.map((c: { key: string }) => c.key)).toEqual(["text", "muted"]);
  for (const c of dto.contrast) expect(c.ratio).toBeGreaterThan(c.min);
  expect(dto.fonts).toContain("Inter");
  expect(dto.issues.every((x: { severity: string }) => x.severity !== "blocking")).toBe(true);

  const r2 = await put({ base: { ...BASE, font: "Manrope", depth: 2 }, base_revision: 1 });
  expect(r2.statusCode, r2.body).toBe(201);
  const g = (await api.inj("GET", "/api/projects/p1/style", getHeaders)).json();
  expect(g.current.revision).toBe(2);
  expect(g.current.resolved.typography.display.family).toBe("Manrope");
  expect(g.history.map((h: { revision: number }) => h.revision)).toEqual([1, 2]);
});

it("плохой контраст — 400 style_contrast с парами; не hex — 400 style_invalid; ревизия не создаётся; база устарела — 409", async () => {
  expect((await put({ base: BASE })).statusCode).toBe(201);
  const bad = await put({ base: { ...BASE, palette_overrides: { muted: "#eeeeee", text: "#dddddd" } } });
  expect(bad.statusCode).toBe(400);
  expect(bad.json()).toMatchObject({ error: "style_contrast" });
  expect(bad.json().pairs.map((p: { key: string; bg: string }) => p.key)).toEqual(["text", "muted"]);
  const hex = await put({ base: { ...BASE, palette_overrides: { text: "red" } } });
  expect(hex.statusCode).toBe(400);
  expect(hex.json().error).toBe("style_invalid");
  expect((await api.inj("GET", "/api/projects/p1/style", getHeaders)).json().current.revision).toBe(1);
  expect((await put({ base: { ...BASE, depth: 3 }, base_revision: 5 })).json().error).toBe("revision_conflict");
  expect((await put({ base: BASE })).json().error).toBe("no_change");
  expect((await api.inj("PUT", "/api/projects/nope/style", okHeaders, { base: BASE })).statusCode).toBe(404);
});

it("ревью Task 33 #9: PUT стиля не видеопроекта — 409 not_video_project, ревизии нет", async () => {
  projects.create(api.core.db, { id: "pc", title: "сцены" });
  const r = await api.inj("PUT", "/api/projects/pc/style", okHeaders, { base: BASE });
  expect(r.statusCode).toBe(409);
  expect(r.json().error).toBe("not_video_project");
  expect(styles.byProject(api.core.db, "pc")).toBeUndefined();
});
