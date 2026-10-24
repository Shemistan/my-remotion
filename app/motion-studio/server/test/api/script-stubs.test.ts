// S1 «сценарий → моушн»: проект kind=script, маршруты спеки §7 (заглушки 501 со схемами тел),
// заглушки обработчиков script.plan / script.package, замки, роль script_director.
import type { Job } from "@ms/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ROLES } from "../../src/agents/runtime.js";
import { loadConfig } from "../../src/config.js";
import { lockKeyFor } from "../../src/jobs/locks.js";
import type { JobContext } from "../../src/jobs/types.js";
import { scriptPackage } from "../../src/pipeline/script-package.js";
import { scriptPlan } from "../../src/pipeline/script-plan.js";
import { type Api, makeApi, okHeaders } from "./helpers.js";

const key = (k: string) => ({ ...okHeaders, "idempotency-key": k });

describe("API сценария", () => {
  let api: Api;
  let id: string;
  beforeEach(async () => {
    api = await makeApi();
    const r = await api.inj("POST", "/api/projects", okHeaders, { title: "s", kind: "script" });
    expect(r.statusCode).toBe(201);
    id = r.json().id;
  });
  afterEach(() => api.close());

  it("POST /projects { kind: script } — настройки по умолчанию 16:9 1920×1080 30 fps", async () => {
    const p = (await api.inj("GET", `/api/projects/${id}`)).json().project;
    expect(p).toMatchObject({ kind: "script", settings: { aspect_ratio: "16:9", width: 1920, height: 1080, fps: { num: 30, den: 1 } } });
  });

  it("маршруты текста и плана: схема тела проверяется (400), тело — 501 not_implemented", async () => {
    expect((await api.inj("PUT", `/api/projects/${id}/script`, okHeaders, { blocks: [{ title: "", text: "a" }] })).statusCode).toBe(501);
    expect((await api.inj("PUT", `/api/projects/${id}/script`, okHeaders, { blocks: [] })).statusCode).toBe(400);
    const get = await api.inj("GET", `/api/projects/${id}/script`);
    expect(get.statusCode).toBe(200);
    expect(get.json()).toMatchObject({ project: { id, kind: "script" }, script: null, plan: null, plan_outdated: false, style: null, approval: { state: "missing" }, scenes: [], batches: [], packages: [] });
    const playground = await api.inj("GET", "/api/projects/playground/script");
    expect(playground.statusCode).toBe(409);
    expect(playground.json()).toMatchObject({ error: "not_script_project" });
    expect((await api.inj("GET", "/api/projects/nope/script")).statusCode).toBe(404);
    expect((await api.inj("POST", `/api/projects/${id}/script/plan`, key("p1"), {})).statusCode).toBe(501);
    expect((await api.inj("POST", `/api/projects/${id}/script/plan`, okHeaders, {})).statusCode).toBe(400); // нет Idempotency-Key
    expect((await api.inj("POST", `/api/projects/${id}/script/plan`, key("p2"), { reading: { wps: 9, lead_s: 0, tail_s: 0 } })).statusCode).toBe(400);
    expect((await api.inj("POST", `/api/projects/${id}/script/plan/ops`, okHeaders, { base_revision: 1, ops: [{ op: "set_status", item_id: "ss_001", status: "rejected" }] })).statusCode).toBe(501);
    expect((await api.inj("POST", `/api/projects/${id}/script/plan/ops`, okHeaders, { base_revision: 1, ops: [{ op: "reorder" }] })).statusCode).toBe(400);
  });

  it("маршруты генерации, пакетов и экспорта: схема тела (400); генерация и пакеты — S5 (409/404), прочее — 501", async () => {
    expect((await api.inj("POST", `/api/projects/${id}/script/generate`, key("g1"), { revision: 1 })).statusCode).toBe(409); // S5: текста нет
    expect((await api.inj("POST", `/api/projects/${id}/script/generate`, key("g2"), { revision: 1, aspect: "1:1" })).statusCode).toBe(400);
    expect((await api.inj("GET", "/api/script-batches/sb_1")).statusCode).toBe(404);
    expect((await api.inj("POST", "/api/script-batches/sb_1/cancel", okHeaders)).statusCode).toBe(404);
    expect((await api.inj("POST", `/api/projects/${id}/script/reframe`, key("r1"), { aspect: "9:16" })).statusCode).toBe(501);
    expect((await api.inj("POST", `/api/projects/${id}/script/reframe`, key("r2"), { aspect: "16:9" })).statusCode).toBe(400);
    expect((await api.inj("POST", `/api/projects/${id}/script/package`, key("k1"), { aspect: "16:9" })).statusCode).toBe(501);
    expect((await api.inj("POST", `/api/projects/${id}/script/package`, key("k2"), {})).statusCode).toBe(400);
    expect((await api.inj("GET", "/api/script-packages/pkg_1")).statusCode).toBe(501);
    expect((await api.inj("GET", "/api/script-packages/pkg_1/cheatsheet?format=csv")).statusCode).toBe(501);
    expect((await api.inj("GET", "/api/script-packages/pkg_1/cheatsheet?format=pdf")).statusCode).toBe(400);
    expect((await api.inj("POST", "/api/script-packages/pkg_1/reveal", okHeaders)).statusCode).toBe(501);
  });
});

describe("задачи, замки, роль", () => {
  const job = (type: Job["type"]): Job => ({ id: "j", type, project_id: "prj_1" } as Job);

  it("заглушки обработчиков: failed pipeline/prepare not_implemented", async () => {
    for (const h of [scriptPlan(() => ({})), scriptPackage(() => ({}))]) {
      expect(await h({} as JobContext)).toEqual({ status: "failed", error: { code: "pipeline", stage: "prepare", message: "not_implemented" } });
    }
  });

  it("замки: script.plan — project:<id>:plan, script.package — project:<id>:package", () => {
    expect(lockKeyFor(job("script.plan"))).toBe("project:prj_1:plan");
    expect(lockKeyFor(job("script.package"))).toBe("project:prj_1:package");
  });

  it("роль script_director: модель и лимиты visual_planner", () => {
    expect(ROLES).toContain("script_director");
    const c = loadConfig({ MS_DATA_DIR: "/tmp/x" }, { agents: { visual_planner: { model: "opus", maxBudgetUsd: 3 } } });
    expect(c.agents.script_director).toEqual(c.agents.visual_planner);
    const o = loadConfig({ MS_DATA_DIR: "/tmp/x" }, { agents: { visual_planner: { model: "opus" }, script_director: { model: "haiku" } } });
    expect(o.agents.script_director.model).toBe("haiku");
  });
});
