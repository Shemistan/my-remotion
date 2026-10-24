// Поиск по KB: по умолчанию только permissive; allowRestricted — с license_class; карточка.
import { afterEach, beforeEach, expect, it } from "vitest";
import { KbHitDtoSchema } from "@ms/contracts";
import { type Api, getHeaders, makeApi } from "./helpers.js";

let api: Api;
beforeEach(async () => {
  api = await makeApi();
});
afterEach(() => api.close());

it("GET /kb/search?q=счётчик → только permissive; allowRestricted=true → и restricted с license_class", async () => {
  const r = await api.inj("GET", `/api/kb/search?q=${encodeURIComponent("счётчик")}`, getHeaders);
  expect(r.statusCode).toBe(200);
  const hits = r.json().map((h: unknown) => KbHitDtoSchema.parse(h));
  expect(hits.map((h: { id: string }) => h.id)).toEqual(["r/counter"]);
  expect(hits[0]).toMatchObject({ license_class: "permissive", repository_url: "https://example.test/r", commit: "abcdef1", patterns: ["quantities"] });
  const all = (await api.inj("GET", `/api/kb/search?q=${encodeURIComponent("счётчик")}&allowRestricted=true`, getHeaders)).json();
  expect(all.find((h: { id: string }) => h.id === "q/restricted")).toMatchObject({ license_class: "restricted" });
  // фильтры: kinds и patterns через запятую
  expect((await api.inj("GET", `/api/kb/search?q=${encodeURIComponent("счётчик")}&kinds=template`, getHeaders)).json()).toEqual([]);
  expect((await api.inj("GET", `/api/kb/search?q=${encodeURIComponent("счётчик")}&patterns=quantities,timeline`, getHeaders)).json()).toHaveLength(1);
  expect((await api.inj("GET", "/api/kb/search?q=x&allowRestricted=maybe", getHeaders)).statusCode).toBe(400);
});

it("GET /kb/:id → CapabilityView и карточка; нет записи → 404", async () => {
  const r = await api.inj("GET", "/api/kb/r/counter", getHeaders);
  expect(r.statusCode).toBe(200);
  expect(r.json()).toMatchObject({ capability: { id: "r/counter", license_class: "permissive" }, card: expect.stringContaining("# Counter") });
  expect((await api.inj("GET", "/api/kb/r/nope", getHeaders)).statusCode).toBe(404);
});
