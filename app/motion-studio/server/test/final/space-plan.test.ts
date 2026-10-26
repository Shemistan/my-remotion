// Fix round 1 Task 45 (I1): оценка места финала — одна функция `finalSpacePlan` и для задачи
// `final.render`, и для API (диалог, предпроверка 409 low_space). После 49b master — по ступени
// выхода: исходник 4K, финал 1080p → master 1080, кэш этой ступени учитывается.
import { afterEach, describe, expect, it } from "vitest";
import { artifactPaths } from "../../src/artifacts/paths.js";
import * as edls from "../../src/db/repos/edls.js";
import * as media from "../../src/db/repos/media.js";
import { timelineFor } from "../../src/edit/timeline-store.js";
import { finalSpacePlan } from "../../src/final/space-plan.js";
import { masterFrames } from "../../src/media/master.js";
import { editedAudioBytes, estimateFinalBytes, estimateMasterBytes } from "../../src/media/space.js";
import { readTimelineDoc } from "../../src/timeline/ops.js";
import { type TimelineApi, key, timelineApi } from "../api/timeline-api-helpers.js";

let t: TimelineApi;
afterEach(() => t.api.close());

const TL = "tl_p1";
const REQ = { resolution: "1080p", quality: "draft", audio_bitrate_kbps: 192 } as const;

/** Исходник p1 — 4K (3840×2160): в БД и как аргумент. */
function make4k() {
  const { db } = t.api.core;
  const a = media.get(db, "med_1")!;
  const probe = { ...a.probe, video: { ...a.probe.video, width: 3840, height: 2160, display_width: 3840, display_height: 2160 } };
  db.prepare("UPDATE media_assets SET probe_json = ? WHERE id = ?").run(JSON.stringify(probe), a.id);
  return { ...a, probe };
}

const publish = (rel: string) =>
  t.api.core.db.prepare("INSERT INTO artifact_publications (dest_rel, job_id, attempt, published_at) VALUES (?, NULL, NULL, ?)").run(rel, new Date().toISOString());

describe("finalSpacePlan", () => {
  it("исходник 4K, финал 1080p → master ступени 1080 (не исходника), кэш ступени учитывается", async () => {
    t = await timelineApi();
    const { db, root } = t.api.core;
    const asset = make4k();
    const doc = readTimelineDoc(db, root, TL, 1);
    const p = await finalSpacePlan(db, root, "p1", asset, doc, REQ);
    expect(p.out).toMatchObject({ width: 1920, height: 1080 });
    expect(p.masterHeight).toBe(1080);
    expect(p.masterCached).toBe(false);
    const tl = timelineFor(db, edls.get(db, "edl_1")!.id, doc.inputs.edl.revision);
    const master1080 = estimateMasterBytes({ frames: masterFrames(asset.probe, doc.fps), width: 1920, height: 1080 });
    const audio = 2 * editedAudioBytes({ durationUs: tl.duration_us, channels: asset.probe.audio!.channels });
    const file = estimateFinalBytes({ ...p.out, quality: "draft" });
    expect(p.bytes).toBe(file + 2 * master1080 + audio);

    // полный 4K master в кэше не помогает: нужна ступень 1080
    publish(artifactPaths(root, "p1").master("med_1", doc.fps));
    expect((await finalSpacePlan(db, root, "p1", asset, doc, REQ)).masterCached).toBe(false);
    publish(artifactPaths(root, "p1").master("med_1", doc.fps, 1080));
    const cached = await finalSpacePlan(db, root, "p1", asset, doc, REQ);
    expect(cached.masterCached).toBe(true);
    expect(cached.bytes).toBe(file + master1080 + audio);
  });

  it("API оценки = finalSpacePlan; порог между оценкой по master 1080 и по полному 4K — без ложного low_space", async () => {
    // свободное место тома и оценки — на первом экземпляре
    t = await timelineApi();
    const asset = make4k();
    const doc = readTimelineDoc(t.api.core.db, t.api.core.root, TL, 1);
    const p = await finalSpacePlan(t.api.core.db, t.api.core.root, "p1", asset, doc, REQ);
    const est = await t.api.inj("GET", `/api/timelines/${TL}/revisions/1/final/estimate?resolution=1080p&quality=draft`);
    expect(est.statusCode).toBe(200);
    expect(est.json()).toMatchObject({ width: 1920, height: 1080, bytes: p.bytes, master_cached: false });
    const frames = masterFrames(asset.probe, doc.fps);
    // оценка до исправления: полный 4K master (копия и кэш)
    const legacy = p.bytes - 2 * estimateMasterBytes({ frames, width: 1920, height: 1080 }) + 2 * estimateMasterBytes({ frames, width: 3840, height: 2160 });
    const free = est.json().free_bytes as number;
    t.api.close();

    // порог: по оценке 1080 места хватает, по прежней (4K) — нет
    const minFree = free - (p.bytes + legacy) / 2;
    expect(minFree).toBeGreaterThan(0);
    t = await timelineApi({ vars: { MS_MIN_FREE_GB: String(minFree / 2 ** 30) } });
    make4k();
    const est2 = await t.api.inj("GET", `/api/timelines/${TL}/revisions/1/final/estimate?resolution=1080p&quality=draft`);
    expect(est2.json()).toMatchObject({ bytes: p.bytes, ok: true });
    const r = await t.api.inj("POST", `/api/timelines/${TL}/revisions/1/final`, key("sp1"), { request: REQ });
    expect(r.statusCode).toBe(202);
  });
});
