// S5: маршруты пакета генерации сценария — POST generate (202/200, Idempotency-Key, 409/422),
// GET /script-batches/:id, POST cancel; пакеты в GET /script. Обработчиков нет: задачи в очереди.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_READING, type ScriptPlanRevisionDoc, type ScriptRevisionDoc, type ScriptSceneItem, quoteOf, readingFrames, tokenizeScript } from "@ms/contracts";
import { saveProjectStyle } from "../../src/analysis/project-style.js";
import { artifactPaths } from "../../src/artifacts/paths.js";
import { ArtifactStore } from "../../src/artifacts/store.js";
import { scriptPlans, scriptRevisions, scripts } from "../../src/db/repos/script.js";
import { SCRIPT_FILE, SCRIPT_PLAN_FILE } from "../../src/script/read.js";
import { type Api, makeApi, okHeaders } from "./helpers.js";

const SHA = "b".repeat(64);
const key = (k: string) => ({ ...okHeaders, "idempotency-key": k });

describe("API пакета генерации сценария", () => {
  let api: Api;
  let id: string;
  beforeEach(async () => {
    api = await makeApi();
    id = (await api.inj("POST", "/api/projects", okHeaders, { title: "Go map", kind: "script" })).json().id;
  });
  afterEach(() => api.close());

  async function seedPlan() {
    const { db, root } = api.core;
    const script: ScriptRevisionDoc = { schema_version: 1, script_id: "scr_a", revision: 1, ...tokenizeScript([{ title: "", text: "Карта хранит пары ключей. Ключ проходит через хэш." }]), author: "user" };
    scripts.create(db, { id: "scr_a", project_id: id });
    const srel = `${artifactPaths(root, id).scriptRev("scr_a", 1)}/${SCRIPT_FILE}`;
    mkdirSync(dirname(join(root, srel)), { recursive: true });
    writeFileSync(join(root, srel), JSON.stringify(script));
    scriptRevisions.insert(db, { script_id: "scr_a", revision: 1, rel_path: srel, sha256: SHA, hash: SHA });
    scripts.setCurrent(db, "scr_a", 1);
    const store = new ArtifactStore({ root, db, guard: api.core.storageCheck });
    const style = await saveProjectStyle({ db, store, root }, id, { preset: "dark-premium", intensity: "balanced", depth: 1 }, "user");
    const item = (n: number, technique: ScriptSceneItem["technique"]): ScriptSceneItem => {
      const s = `w_00000${n * 4 + 1}`;
      const e = `w_00000${n * 4 + 4}`;
      return {
        id: `ss_00${n + 1}`, status: "accepted", origin: "agent", start_word_id: s, end_word_id: e, quote: quoteOf(script, s, e), block_id: "b1", words: 4, at_s: 0,
        frames: readingFrames(4, DEFAULT_READING, { num: 30, den: 1 }), technique, pattern: "quantities", purpose: "п", idea: "и", key_terms: [], data: [], importance: 2, anchor_ids: [],
      };
    };
    const doc: ScriptPlanRevisionDoc = {
      schema_version: 1, plan_id: "pln_a", revision: 1, inputs: { script: { id: "scr_a", revision: 1, hash: SHA }, style: { id: style.style_id, revision: 1, hash: SHA } },
      fps: { num: 30, den: 1 }, aspect: "16:9", reading: DEFAULT_READING, analysis: { chapters: [], anchors: [], entities: [], numbers: [], causal: [], disputed: [] },
      items: [item(0, "hero-number"), item(1, "timeline")], skipped: [], issues: [], diversity: { techniques: {}, adjacent_repeats: 0, kinetic_share: 0 },
    };
    scriptPlans.create(db, { id: "pln_a", project_id: id });
    const prel = `${artifactPaths(root, id).planRev("pln_a", 1)}/${SCRIPT_PLAN_FILE}`;
    mkdirSync(dirname(join(root, prel)), { recursive: true });
    writeFileSync(join(root, prel), JSON.stringify(doc));
    scriptPlans.insertRevision(db, { doc, rel_path: prel, sha256: SHA });
  }

  it("generate → 202 пакет; повтор ключа → 200 тот же; GET пакета; cancel → cancelled; пакет в GET /script", async () => {
    await seedPlan();
    const r = await api.inj("POST", `/api/projects/${id}/script/generate`, key("g1"), { revision: 1 });
    expect(r.statusCode, r.body).toBe(202);
    const b = r.json();
    expect(b).toMatchObject({ aspect: "16:9", plan_revision: 1, counts: { total: 2, pending: 2 } });
    expect(b.items.map((x: { item_id: string }) => x.item_id)).toEqual(["ss_001", "ss_002"]);
    const again = await api.inj("POST", `/api/projects/${id}/script/generate`, key("g1"), { revision: 1 });
    expect(again.statusCode).toBe(200);
    expect(again.json().id).toBe(b.id);
    const reused = await api.inj("POST", `/api/projects/${id}/script/generate`, key("g1"), { revision: 1, aspect: "9:16" });
    expect(reused.statusCode).toBe(422);
    expect(reused.json().error).toBe("idempotency_key_reused");
    const get = await api.inj("GET", `/api/script-batches/${b.id}`);
    expect(get.statusCode).toBe(200);
    expect(get.json().id).toBe(b.id);
    const state = (await api.inj("GET", `/api/projects/${id}/script`)).json();
    expect(state.batches.map((x: { id: string }) => x.id)).toEqual([b.id]);
    expect(state.approval).toMatchObject({ state: "valid", ref: "plan:pln_a@r1" });
    expect(state.scenes.map((x: { status: string }) => x.status)).toEqual(["pending", "pending"]);
    const c = await api.inj("POST", `/api/script-batches/${b.id}/cancel`, okHeaders);
    expect(c.statusCode).toBe(200);
    expect(c.json().counts).toMatchObject({ total: 2, cancelled: 2 });
  });

  it("S10 reframe {aspect} и {aspect, item_ids}: 202 пакет 9:16 (без готовых 16:9 — все в skipped), повтор ключа — 200, другое тело — 422", async () => {
    await seedPlan();
    const r = await api.inj("POST", `/api/projects/${id}/script/reframe`, key("r1"), { aspect: "9:16" });
    expect(r.statusCode, r.body).toBe(202);
    expect(r.json()).toMatchObject({ aspect: "9:16", plan_revision: 1, items: [], skipped: [{ item_id: "ss_001", reason: "нет готовой версии 16:9" }, { item_id: "ss_002", reason: "нет готовой версии 16:9" }] });
    const again = await api.inj("POST", `/api/projects/${id}/script/reframe`, key("r1"), { aspect: "9:16" });
    expect(again.statusCode).toBe(200);
    expect(again.json().id).toBe(r.json().id);
    expect((await api.inj("POST", `/api/projects/${id}/script/reframe`, key("r1"), { aspect: "9:16", item_ids: ["ss_002"] })).statusCode).toBe(422);
    const one = await api.inj("POST", `/api/projects/${id}/script/reframe`, key("r2"), { aspect: "9:16", item_ids: ["ss_002"] });
    expect(one.statusCode).toBe(202);
    expect(one.json().skipped).toEqual([{ item_id: "ss_002", reason: "нет готовой версии 16:9" }]);
    expect((await api.inj("POST", `/api/projects/${id}/script/reframe`, okHeaders, { aspect: "9:16" })).statusCode).toBe(400);
  });

  it("ошибки: нет ключа — 400; нет текста — 409 no_script; ревизия не текущая — 409 plan_outdated; чужой пакет — 404", async () => {
    expect((await api.inj("POST", `/api/projects/${id}/script/generate`, okHeaders, { revision: 1 })).statusCode).toBe(400);
    const none = await api.inj("POST", `/api/projects/${id}/script/generate`, key("e1"), { revision: 1 });
    expect(none.statusCode).toBe(409);
    expect(none.json().error).toBe("no_script");
    await seedPlan();
    const old = await api.inj("POST", `/api/projects/${id}/script/generate`, key("e2"), { revision: 2 });
    expect(old.statusCode).toBe(409);
    expect(old.json().error).toBe("plan_outdated");
    expect((await api.inj("POST", "/api/projects/playground/script/generate", key("e3"), { revision: 1 })).json().error).toBe("not_script_project");
    expect((await api.inj("GET", "/api/script-batches/sb_nope")).statusCode).toBe(404);
    expect((await api.inj("POST", "/api/script-batches/sb_nope/cancel", okHeaders)).statusCode).toBe(404);
  });
});
