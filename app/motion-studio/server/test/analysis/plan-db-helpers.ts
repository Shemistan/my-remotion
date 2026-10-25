// Видеопроект с планом для тестов правки плана и Approval B (Task 32): p1, транскрипт trn_1 из 20
// слов `plan-helpers`, EDL edl_1 r1 с принятой вырезкой 2,2–3,7 с, анализ видеоряда ftg_1, стиль
// проекта r1 и план pln_1 r1.
import type { FootageAnalysis, ScenePlanItem, VisualPlanRevisionDoc } from "@ms/contracts";
import { canonicalHash } from "@ms/contracts/canonical";
import { artifactPaths } from "../../src/artifacts/paths.js";
import type { ArtifactStore } from "../../src/artifacts/store.js";
import { saveProjectStyle } from "../../src/analysis/project-style.js";
import type { Db } from "../../src/db/open.js";
import * as edls from "../../src/db/repos/edls.js";
import * as footageRepo from "../../src/db/repos/footage.js";
import * as plans from "../../src/db/repos/plans.js";
import { dec, seedVideo } from "../edit/helpers.js";
import { CUT, FACE, SOURCE_US, footage, planDoc, words } from "./plan-helpers.js";

export const STYLE_BASE = { preset: "dark-premium" as const, intensity: "balanced" as const, depth: 1 };

export async function seedFootage(db: Db, store: ArtifactStore, root: string, doc: FootageAnalysis = footage(FACE)): Promise<void> {
  const rel = artifactPaths(root, "p1").footage(doc.id);
  await store.writeRevision(rel, "footage.json", doc, (d, files) => {
    footageRepo.insert(d, { id: doc.id, project_id: "p1", media_id: "med_1", mode: doc.mode, rel_path: `${rel}/footage.json`, sha256: files[0]!.sha256 });
  });
}

/** Публикует ревизию плана (как сделала бы задача) — для тестов. */
export async function publishPlan(db: Db, store: ArtifactStore, root: string, doc: VisualPlanRevisionDoc): Promise<void> {
  const rel = artifactPaths(root, "p1").planRev(doc.plan_id, doc.revision);
  await store.writeRevision(rel, "plan.json", doc, (d, files) => {
    if (!plans.get(d, doc.plan_id)) plans.create(d, { id: doc.plan_id, project_id: "p1" });
    plans.insertRevision(d, { doc, rel_path: `${rel}/plan.json`, sha256: files[0]!.sha256, opportunities: [] });
  });
}

/** p1 с EDL r1 (вырезка `CUT` принята), анализом видеоряда, стилем r1 и планом r1 из `items`. */
export async function seedPlanProject(db: Db, store: ArtifactStore, root: string, items: ScenePlanItem[], ftg?: FootageAnalysis): Promise<VisualPlanRevisionDoc> {
  await seedVideo(db, store, root, { words, decisions: [dec("d1", { status: "accepted", source_start_us: CUT.start_us, source_end_us: CUT.end_us })], durationUs: SOURCE_US });
  await seedFootage(db, store, root, ftg);
  const style = await saveProjectStyle({ db, store, root }, "p1", STYLE_BASE, "agent", { rationale: "тест" });
  const doc = planDoc(items.map((x) => ({ ...x, style_id: style.style_id })), {
    inputs: {
      edl: { id: "edl_1", revision: 1, hash: edls.revision(db, "edl_1", 1)!.hash }, transcript: { id: "trn_1", revision: 1 }, semantic_id: "sem_1", footage_id: "ftg_1",
      style: { id: style.style_id, revision: style.revision, hash: canonicalHash(style) },
    },
  });
  await publishPlan(db, store, root, doc);
  return doc;
}
