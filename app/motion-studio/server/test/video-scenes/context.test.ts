// Task 37′: контекст видеосцены (вход `video` у playground.generate) по ревизии плана —
// стиль проекта, размещение, окно речи и моменты ключевых слов, лицо за окно сцены, кадр
// исходника под сценой; речь сцены для проверки подписей.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type ScenePlanItem, VideoSceneContextSchema, placementFor, videoKeyMoments, videoSceneWindow } from "@ms/contracts";
import { buildPlanItems } from "../../src/analysis/plan-build.js";
import { currentProjectStyle } from "../../src/analysis/project-style.js";
import { ArtifactStore } from "../../src/artifacts/store.js";
import { migrate } from "../../src/db/migrate.js";
import { type Db, openDb } from "../../src/db/open.js";
import { CONTEXT_KEYFRAMES_MAX, contextFrames, planFps, videoNarration, videoSceneContext } from "../../src/video-scenes/context.js";
import { makeStore, removeStore, type TestStore } from "../db/helpers.js";
import { seedPlanProject } from "../analysis/plan-db-helpers.js";
import { FACE, SOURCE_US, ctx, footage, opp, out } from "../analysis/plan-helpers.js";

const FACE2 = { x: 0.6, y: 0.1, w: 0.2, h: 0.3 };
// два шота: лицо FACE до 7 с, FACE2 после; кадры шотов каждые 1 с
const ftg = (() => {
  const f = footage(FACE);
  const a = { ...f.shots[0]!, id: "shot_001", source_end_us: 7_000_000, keyframes: [1, 2, 3, 4, 5, 6].map((s) => ({ us: s * 1_000_000, path: `frames/${String(s * 1_000_000).padStart(12, "0")}.png` })) };
  const b = {
    ...f.shots[0]!, id: "shot_002", source_start_us: 7_000_000, source_end_us: SOURCE_US, face: { union: FACE2, detected_ratio: 1, source: "vision" as const },
    keyframes: [8, 10, 11].map((s) => ({ us: s * 1_000_000, path: `frames/${String(s * 1_000_000).padStart(12, "0")}.png` })),
  };
  return { ...f, shots: [a, b] };
})();

const items = buildPlanItems(out([opp(), opp({ id: "o2", s: 11, e: 15, key_terms: [{ text: "итог", word_id: "w_000013" }], composition_mode: "fullscreen", zone: "full" })]), ctx()).items;

let s: TestStore;
let db: Db;
let doc: Awaited<ReturnType<typeof seedPlanProject>>;
beforeAll(async () => {
  s = await makeStore("ms-v37-ctx-");
  db = openDb(s.root);
  await migrate(db);
  doc = await seedPlanProject(db, new ArtifactStore({ root: s.root, db, guard: s.guard }), s.root, items, ftg);
});
afterAll(async () => {
  db?.close();
  if (s) await removeStore(s);
});

const item = (i: number): ScenePlanItem => doc.items[i]!;

describe("videoSceneContext", () => {
  it("overlay: стиль текущий, размещение по плану, окно и моменты, лицо и кадр исходника — валидный вход video", () => {
    const x = item(0);
    const c = videoSceneContext(db, s.root, { projectId: "p1", doc, item: x });
    expect(VideoSceneContextSchema.safeParse(c).success).toBe(true);
    const fps = planFps(db, doc);
    expect(fps).toEqual({ num: 30, den: 1 });
    const style = currentProjectStyle(db, s.root, "p1")!;
    expect(c).toMatchObject({ project_id: "p1", plan_id: doc.plan_id, plan_revision: doc.revision, item_id: x.id, style: style.base });
    expect(c.placement).toEqual(placementFor(x.composition_mode, x.zone, x.rect));
    expect(c.placement.transparent).toBe(true);
    const w = videoSceneWindow(x, fps);
    expect([c.lead_frames, c.tail_frames]).toEqual([w.lead, w.tail]);
    expect(c.key_moments).toEqual(videoKeyMoments(x, fps));
    expect(c.key_moments!.map((m) => m.text)).toEqual(["40%"]);
    // сцена целиком в первом шоте → лицо FACE; кадр — ближайший к середине окна исходника
    expect(c.face).toEqual(FACE);
    const mid = (x.source.start_us + x.source.end_us) / 2;
    const near = ftg.shots.flatMap((sh) => sh.keyframes).reduce((a, b) => (Math.abs(b.us - mid) < Math.abs(a.us - mid) ? b : a));
    expect(c.context_frame_rel).toBe(`workspace/projects/p1/analysis/footage/ftg_1/${near.path}`);
  });

  it("лицо — объединение рамок шотов, которые пересекает сцена; fullscreen непрозрачный", () => {
    const x = { ...item(1), source: { start_us: 6_000_000, end_us: 8_000_000 } };
    const c = videoSceneContext(db, s.root, { projectId: "p1", doc, item: x });
    expect(c.placement).toMatchObject({ mode: "fullscreen", zone: "full", transparent: false });
    const r = c.face!;
    expect(r.x).toBeCloseTo(0.55, 6);
    expect(r.y).toBeCloseTo(0.1, 6);
    expect(r.x + r.w).toBeCloseTo(0.8, 6);
    expect(r.y + r.h).toBeCloseTo(0.6, 6);
  });

  it("речь сцены — услышанные слова её границ", () => {
    expect(videoNarration(db, s.root, doc, item(0))).toBe("выручка выросла на 40% за");
  });
});

describe("contextFrames (fix I2)", () => {
  it("ключевые кадры окна исходника → кадр сцены от начала окна; вне окна — нет; не больше CONTEXT_KEYFRAMES_MAX", () => {
    const fa = { shots: [{ keyframes: [{ us: 500_000, path: "kf/a.jpg" }, { us: 2_000_000, path: "kf/b.jpg" }, { us: 4_000_000, path: "kf/c.jpg" }, { us: 9_000_000, path: "kf/d.jpg" }] }] } as unknown as Parameters<typeof contextFrames>[0];
    expect(contextFrames(fa, "ws/p1/footage/f1/footage.json", { start_us: 1_000_000, end_us: 5_000_000 }, { num: 30, den: 1 }, 120))
      .toEqual([{ frame: 30, rel: "ws/p1/footage/f1/kf/b.jpg" }, { frame: 90, rel: "ws/p1/footage/f1/kf/c.jpg" }]);
    const many = { shots: [{ keyframes: Array.from({ length: 40 }, (_, k) => ({ us: k * 100_000, path: `kf/${k}.jpg` })) }] } as unknown as Parameters<typeof contextFrames>[0];
    expect(contextFrames(many, "f/x.json", { start_us: 0, end_us: 4_000_000 }, { num: 30, den: 1 }, 120)).toHaveLength(CONTEXT_KEYFRAMES_MAX);
  });
});
