// S11 (спека §12 п.2): разнообразие пакета после генерации — `packageDiversity` по spec и
// kit-компонентам версий, `warningsForState` — по текущим ready-версиям 16:9 плана.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DEFAULT_READING, type HoldMode, type MotionSpec, type Element, type PlanIssue, type SceneStructure, type ScriptPlanRevisionDoc, type ScriptSceneItem, type Technique, defaultSettings } from "@ms/contracts";
import { TECHNIQUES } from "@ms/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { artifactPaths } from "../../src/artifacts/paths.js";
import { migrate } from "../../src/db/migrate.js";
import { type Db, openDb } from "../../src/db/open.js";
import * as projects from "../../src/db/repos/projects.js";
import * as scenes from "../../src/db/repos/scenes.js";
import { scriptPlans, scriptScenes } from "../../src/db/repos/script.js";
import * as versions from "../../src/db/repos/versions.js";
import { packageDiversity, warningsForState } from "../../src/script/diversity.js";
import { SCRIPT_PLAN_FILE } from "../../src/script/read.js";
import { makeStore, removeStore, type TestStore } from "../db/helpers.js";

const codes = (issues: PlanIssue[] | undefined) => (issues ?? []).map((x) => x.code);

function item(technique: Technique, n = 1): ScriptSceneItem {
  const id = `ss_${String(n).padStart(3, "0")}`;
  return {
    id, status: "accepted", origin: "agent", start_word_id: "w_000001", end_word_id: "w_000003", quote: "Раз два три",
    block_id: "b1", words: 3, at_s: 0, frames: { lead: 15, speech: 36, tail: 39, total: 90 }, technique, pattern: "quantities",
    purpose: "п", idea: "и", key_terms: [], data: [], importance: 2, anchor_ids: [],
  };
}

function spec(o: { structure?: SceneStructure; hold?: HoldMode; entrances?: Element["entrance"][] } = {}): MotionSpec {
  return {
    title: "т", purpose: "п", duration_frames: 90, fps: { num: 30, den: 1 }, style_preset: "dark-premium",
    composition: { archetype: "split", idea: "и", focus: "ф", transitions: "т", ...(o.structure ? { structure: o.structure } : {}) },
    elements: [{ id: "a", kind: "text", role: "заголовок", entrance: "rise", content: { text: "A" } }, ...(o.entrances ?? []).map((entrance, i) => ({ id: `e${i}`, kind: "text" as const, role: "подпись", entrance, content: { text: `e${i}` } }))],
    phases: [
      { id: "act", role: "action", weight: 2, element_ids: ["a"] },
      { id: "hold", role: "hold", weight: 1, element_ids: ["a"], hold_mode: o.hold ?? "now-pulse" },
    ],
    beats: [
      { id: "b1", start_frame: 0, end_frame: 60, action: "show", description: "", element_ids: ["a"], phase: "act" },
      { id: "b2", start_frame: 60, end_frame: 90, action: "hold", kind: "hold", description: "", element_ids: ["a"], phase: "hold" },
    ],
  };
}

let seq = 0;
const s = (technique: Technique, sp: MotionSpec | null, kit: string[]) => ({ item: item(technique, ++seq), spec: sp, kit });
beforeEach(() => {
  seq = 0;
});

describe("packageDiversity", () => {
  it("приём реализован, если в kit есть его ключевой компонент", () => {
    const one = (...a: Parameters<typeof s>) => {
      seq = 0;
      return s(...a);
    };
    expect(codes(packageDiversity([one("hero-number", spec({ structure: "count-up" }), ["AnimatedNumber"])]).per_item.ss_001)).toEqual([]);
    expect(codes(packageDiversity([one("bar-compare", spec(), ["KineticText"])]).per_item.ss_001)).toContain("technique_not_realized");
    expect(codes(packageDiversity([one("structure-build", spec(), ["Card"])]).per_item.ss_001)).not.toContain("technique_not_realized"); // kit без "layout"
  });

  it("соседи с той же структурой, первым ключевым компонентом и режимом удержания — adjacent_scene_repeat у второй", () => {
    const specA = spec({ structure: "split-reveal" });
    const r = packageDiversity([s("race", specA, ["LatencyRace"]), s("timeline", specA, ["LatencyRace"])]);
    expect(codes(r.per_item.ss_002)).toContain("adjacent_scene_repeat");
    expect(codes(r.per_item.ss_001)).not.toContain("adjacent_scene_repeat");
    expect(r.per_item.ss_002!.find((x) => x.code === "adjacent_scene_repeat")).toMatchObject({ severity: "warning", item_id: "ss_002" });
    // другой режим удержания — уже не повтор
    seq = 0;
    expect(codes(packageDiversity([s("race", specA, ["LatencyRace"]), s("timeline", spec({ structure: "split-reveal", hold: "data-shimmer" }), ["LatencyRace"])]).per_item.ss_002)).not.toContain("adjacent_scene_repeat");
  });

  it("сцена без версии (spec null) не проверяется и не участвует в соседстве", () => {
    const r = packageDiversity([s("race", null, []), s("timeline", spec(), ["Timeline"])]);
    expect(r.per_item.ss_001).toEqual([]);
    expect(codes(r.per_item.ss_002)).toEqual([]);
  });

  // S11-fix M9: доля fade — по входам spec (структурно), не по тексту описания замечания QA
  it("сводка: структуры, kit, доля сцен с однообразным входом fade по spec", () => {
    const r = packageDiversity([
      s("hero-number", spec({ structure: "count-up", entrances: ["fade", "fade", "fade", "count"] }), ["AnimatedNumber", "Background"]),
      s("timeline", spec({ entrances: ["rise", "rise", "rise"] }), ["Timeline", "Background"]),
      s("race", spec({ structure: "split-reveal" }), ["LatencyRace"]),
      s("flow-graph", spec({ structure: "continuous-flow" }), ["FlowGraph"]),
    ]);
    expect(r.summary.structures).toEqual({ "count-up": 1, "build-strike": 1, "split-reveal": 1, "continuous-flow": 1 });
    expect(r.summary.kit).toEqual({ AnimatedNumber: 1, Background: 2, Timeline: 1, LatencyRace: 1, FlowGraph: 1 });
    expect(r.summary.fade_share).toBe(0.25);
  });

  // S11-fix M6: сообщения человеку — по смыслу, без имён компонентов kit, слагов и hold-режимов
  it("сообщения без сырых кодов: «нет сравнения», «тот же режим финала»", () => {
    for (const t of TECHNIQUES) {
      seq = 0;
      const msg = packageDiversity([s(t.slug, spec(), [])]).per_item.ss_001!.find((x) => x.code === "technique_not_realized")!.message;
      expect(msg, t.slug).not.toMatch(/[A-Za-z]/);
      expect(msg, t.slug).not.toContain("главного элемента");
    }
    seq = 0;
    expect(packageDiversity([s("split-versus", spec(), [])]).per_item.ss_001![0]!.message).toContain("нет сравнения");
    seq = 0;
    const specA = spec({ structure: "split-reveal" });
    const rep = packageDiversity([s("race", specA, ["LatencyRace"]), s("timeline", specA, ["LatencyRace"])]).per_item.ss_002!.find((x) => x.code === "adjacent_scene_repeat")!;
    expect(rep.message).toContain("тот же режим финала");
    expect(rep.message).not.toMatch(/[A-Za-z]/);
  });
});

describe("warningsForState", () => {
  let st: TestStore;
  let db: Db;
  beforeEach(async () => {
    st = await makeStore("ms-package-diversity-");
    db = openDb(st.root);
    await migrate(db, { log: () => undefined });
    projects.create(db, { id: "p1", kind: "script", title: "Сценарий" });
  });
  afterEach(async () => {
    db.close();
    await removeStore(st);
  });

  /** Готовая версия сцены: spec.json, qa.json и код с импортами kit. */
  function readyVersion(sceneId: string, sp: MotionSpec, kit: string[]): void {
    const rel = `workspace/projects/p1/scenes/${sceneId}/versions/ver_${sceneId}`;
    mkdirSync(join(st.root, rel, "src", "parts"), { recursive: true });
    writeFileSync(join(st.root, rel, "spec.json"), JSON.stringify(sp));
    writeFileSync(join(st.root, rel, "src", "Scene.tsx"), `import { ${kit[0] ?? "Background"} } from "@ms/motion-kit";\n`);
    writeFileSync(join(st.root, rel, "src", "parts", "Extra.tsx"), `import { useStyle${kit[1] ? `, ${kit[1]}` : ""} } from "@ms/motion-kit";\n`);
    versions.insert(db, {
      id: `ver_${sceneId}`, scene_id: sceneId, parent_version_id: null, number: 1, status: "ready", prompt: "p", edit_plan: null,
      settings: defaultSettings(), path: rel, manifest_sha256: "a".repeat(64), created_by_job_id: null, created_at: new Date().toISOString(),
    });
    scenes.setCurrent(db, sceneId, `ver_${sceneId}`);
  }

  it("по текущим ready-версиям 16:9: ключ — scene_id; 9:16 и сцены без версии — без проверки", () => {
    const items = [item("race", 1), item("timeline", 2), item("bar-compare", 3)];
    const doc: ScriptPlanRevisionDoc = {
      schema_version: 1, plan_id: "pln_1", revision: 1,
      inputs: { script: { id: "scr_1", revision: 1, hash: "a".repeat(64) }, style: { id: "sty_1", revision: 1, hash: "a".repeat(64) } },
      fps: { num: 30, den: 1 }, aspect: "16:9", reading: DEFAULT_READING,
      analysis: { chapters: [], anchors: [], entities: [], numbers: [], causal: [], disputed: [] },
      items, skipped: [], issues: [], diversity: { techniques: {}, adjacent_repeats: 0, kinetic_share: 0 },
    };
    scriptPlans.create(db, { id: "pln_1", project_id: "p1" });
    const rel = `${artifactPaths(st.root, "p1").planRev("pln_1", 1)}/${SCRIPT_PLAN_FILE}`;
    mkdirSync(dirname(join(st.root, rel)), { recursive: true });
    writeFileSync(join(st.root, rel), JSON.stringify(doc));
    scriptPlans.insertRevision(db, { doc, rel_path: rel, sha256: "a".repeat(64) });
    const specA = spec({ structure: "split-reveal" });
    for (const [n, id] of [[1, "scn_1"], [2, "scn_2"], [3, "scn_3"]] as const) {
      scenes.create(db, { id, project_id: "p1", title: id });
      scriptScenes.insert(db, { project_id: "p1", plan_id: "pln_1", item_id: `ss_00${n}`, aspect: "16:9", scene_id: id, batch_id: null, job_id: null, item_fingerprint: "f" });
    }
    scenes.create(db, { id: "scn_v", project_id: "p1", title: "v" });
    scriptScenes.insert(db, { project_id: "p1", plan_id: "pln_1", item_id: "ss_001", aspect: "9:16", scene_id: "scn_v", batch_id: null, job_id: null, item_fingerprint: "f" });
    readyVersion("scn_1", specA, ["LatencyRace"]);
    readyVersion("scn_2", specA, ["Card", "LatencyRace"]);
    readyVersion("scn_v", specA, ["KineticText"]);
    // scn_3 без версии

    const w = warningsForState(db, st.root, "p1", doc);
    expect(codes(w.scn_1)).toEqual([]);
    expect(codes(w.scn_2)).toEqual(expect.arrayContaining(["technique_not_realized", "adjacent_scene_repeat"]));
    expect(w.scn_3 ?? []).toEqual([]);
    expect(w.scn_v).toBeUndefined();
    expect(warningsForState(db, st.root, "p1", null)).toEqual({});

    // S11-fix M8: готовая версия читается один раз (кэш по version_id) — файлы её не меняются
    writeFileSync(join(st.root, "workspace/projects/p1/scenes/scn_2/versions/ver_scn_2/src/Scene.tsx"), `import { Timeline } from "@ms/motion-kit";\n`);
    expect(codes(warningsForState(db, st.root, "p1", doc).scn_2)).toEqual(expect.arrayContaining(["technique_not_realized", "adjacent_scene_repeat"]));
  });
});
