// Общее для тестов API таймлайна и финала (Task 45): настоящий `buildApp` в tmp-хранилище
// (обработчиков задач нет — задачи остаются в очереди), в его БД — видеопроект p1 как у
// `seedTimelineProject` (A, B, две сцены с версиями; C — по выбору). Засев — после старта ядра:
// проверка целостности при старте не трогает версии, созданные позже.
import { canonicalHash } from "@ms/contracts/canonical";
import { approveVisualPlan } from "../../src/analysis/approval-b.js";
import { saveProjectStyle } from "../../src/analysis/project-style.js";
import { ArtifactStore } from "../../src/artifacts/store.js";
import * as edls from "../../src/db/repos/edls.js";
import { approveRoughCut } from "../../src/edit/approval-a.js";
import { buildTimelineDoc } from "../../src/timeline/build.js";
import { publishTimelineRevision } from "../../src/timeline/ops.js";
import { STYLE_BASE, publishPlan, seedFootage } from "../analysis/plan-db-helpers.js";
import { planDoc } from "../analysis/plan-helpers.js";
import { seedVideo } from "../edit/helpers.js";
import { ITEMS, type TimelineEnv, seedScene, words } from "../timeline/helpers.js";
import { type Api, makeApi, okHeaders } from "./helpers.js";

export const key = (k: string) => ({ ...okHeaders, "idempotency-key": k });

export interface TimelineApi {
  api: Api;
  sceneIds: string[];
  versionIds: string[];
}

/** p1 с двумя сценами (C у второй — `secondC`); `publish` — сразу ревизия r1 таймлайна. */
export async function timelineApi(o: { secondC?: boolean; publish?: boolean; vars?: NodeJS.ProcessEnv } = {}): Promise<TimelineApi> {
  const api = await makeApi(o.vars ? { env: o.vars } : {});
  const { db, root } = api.core;
  const store = new ArtifactStore({ root, db, guard: api.core.storageCheck });
  await seedVideo(db, store, root, { words, decisions: [], durationUs: 30_000_000 });
  await seedFootage(db, store, root);
  const style = await saveProjectStyle({ db, store, root }, "p1", STYLE_BASE, "agent", { rationale: "тест" });
  const doc = planDoc(ITEMS.map((x) => ({ ...x, style_id: style.style_id })), {
    inputs: {
      edl: { id: "edl_1", revision: 1, hash: edls.revision(db, "edl_1", 1)!.hash }, transcript: { id: "trn_1", revision: 1 }, semantic_id: "sem_1", footage_id: "ftg_1",
      style: { id: style.style_id, revision: style.revision, hash: canonicalHash(style) },
    },
  });
  await publishPlan(db, store, root, doc);
  approveRoughCut(db, "p1");
  approveVisualPlan(db, "p1", root);
  const env: TimelineEnv = { s: api.s, db, store, styleRef: { id: style.style_id, revision: style.revision } };
  const a = seedScene(env, ITEMS[0]!);
  const b = seedScene(env, ITEMS[1]!, { withC: o.secondC ?? true });
  if (o.publish ?? true) await publishTimelineRevision({ db, store, root }, "p1", buildTimelineDoc(db, root, "p1"));
  return { api, sceneIds: [a.sceneId, b.sceneId], versionIds: [a.version.id, b.version.id] };
}
