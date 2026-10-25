// S2 «сценарий → моушн»: `PUT /api/projects/:id/script` — новая ревизия текста (спека §7).
import { DEFAULT_READING } from "@ms/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Api, getHeaders, makeApi, okHeaders } from "./helpers.js";

describe("PUT /api/projects/:id/script", () => {
  let api: Api;
  let id: string;
  const body = { blocks: [{ title: "Вступление", text: "Раз два. Три четыре!" }] };
  beforeEach(async () => {
    api = await makeApi();
    const r = await api.inj("POST", "/api/projects", okHeaders, { title: "s", kind: "script" });
    expect(r.statusCode).toBe(201);
    id = r.json().id;
  });
  afterEach(() => api.close());

  it("200 ScriptDto; повтор с той же base_revision — 409; GET видит ревизию, плана нет", async () => {
    const r1 = await api.inj("PUT", `/api/projects/${id}/script`, okHeaders, body);
    expect(r1.statusCode).toBe(200);
    expect(r1.json()).toMatchObject({ script: { revision: 1, author: "user", blocks: [{ id: "b1", title: "Вступление" }] }, reading: DEFAULT_READING });
    expect(r1.json().script.words).toHaveLength(4);

    const r2 = await api.inj("PUT", `/api/projects/${id}/script`, okHeaders, { ...body, base_revision: 1 });
    expect(r2.statusCode).toBe(200);
    expect(r2.json().script).toMatchObject({ revision: 2, parent_revision: 1 });
    const again = await api.inj("PUT", `/api/projects/${id}/script`, okHeaders, { ...body, base_revision: 1 });
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ error: "revision_conflict", base: 1, current: 2 });

    const get = await api.inj("GET", `/api/projects/${id}/script`);
    expect(get.statusCode).toBe(200);
    expect(get.json()).toMatchObject({ script: { revision: 2 }, plan: null, plan_outdated: false });
  });

  it("после первого PUT GET: script.revision = 1, plan: null, plan_outdated: false", async () => {
    expect((await api.inj("PUT", `/api/projects/${id}/script`, okHeaders, body)).statusCode).toBe(200);
    expect((await api.inj("GET", `/api/projects/${id}/script`, getHeaders)).json()).toMatchObject({ script: { revision: 1 }, plan: null, plan_outdated: false });
  });

  it("ошибки: empty_block 400, script_too_long 413, чужой Origin 403, не сценарный 409, нет проекта 404", async () => {
    const empty = await api.inj("PUT", `/api/projects/${id}/script`, okHeaders, { blocks: [{ title: "", text: "   " }] });
    expect(empty.statusCode).toBe(400);
    expect(empty.json()).toMatchObject({ error: "empty_block", block: 1 });
    const long = await api.inj("PUT", `/api/projects/${id}/script`, okHeaders, { blocks: [{ title: "", text: "слово ".repeat(6001) }] });
    expect(long.statusCode).toBe(413);
    expect(long.json()).toMatchObject({ error: "script_too_long", words: 6001, max: 6000 });
    const foreign = await api.inj("PUT", `/api/projects/${id}/script`, { ...okHeaders, origin: "http://evil.test" }, body);
    expect(foreign.statusCode).toBe(403);
    expect((await api.inj("PUT", "/api/projects/playground/script", okHeaders, body)).json()).toMatchObject({ error: "not_script_project" });
    expect((await api.inj("PUT", "/api/projects/nope/script", okHeaders, body)).statusCode).toBe(404);
    expect((await api.inj("PUT", `/api/projects/${id}/script`, okHeaders, { blocks: [] })).statusCode).toBe(400);
    expect((await api.inj("GET", `/api/projects/${id}/script`)).json().script).toBeNull();
  });
});
