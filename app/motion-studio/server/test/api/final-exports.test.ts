// Task 45: API финала — «Смонтировать и экспортировать» (`requestFinal`: гейт → 409 с перечнем
// причин, иначе 202 { approval, job }, повтор ключа — та же задача), оценка места (low_space),
// экспорты проекта и карточка с `verify.json` и повтором (`compare.json`), файл по Range с
// `Content-Disposition`, повтор экспорта (`final.reproduce`).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type FinalVerifyReport, FinalExportDtoSchema } from "@ms/contracts";
import { artifactPaths } from "../../src/artifacts/paths.js";
import * as approvalsRepo from "../../src/db/repos/approvals.js";
import * as jobs from "../../src/db/repos/jobs.js";
import { finalExports } from "../../src/db/repos/video.js";
import { COMPARE_FILE, FINAL_FILE, VERIFY_FILE } from "../../src/final/manifest.js";
import { addVersion, approveC } from "../timeline/helpers.js";
import { okHeaders } from "./helpers.js";
import { type TimelineApi, key, timelineApi } from "./timeline-api-helpers.js";

let t: TimelineApi;
afterEach(() => t.api.close());

const TL = "tl_p1";
const REQ = { resolution: "720p", quality: "draft", audio_bitrate_kbps: 192 } as const;
const final = (k: string, n = 1, request: unknown = REQ) => t.api.inj("POST", `/api/timelines/${TL}/revisions/${n}/final`, key(k), { request });

describe("POST /api/timelines/:id/revisions/:n/final", () => {
  it("гейт пройден → 202 { approval final, job final.render }; тот же ключ — 200, та же задача", async () => {
    t = await timelineApi();
    const r = await final("f1");
    expect(r.statusCode).toBe(202);
    expect(r.json().approval).toMatchObject({ kind: "final", subject_ref: `timeline:${TL}@r1` });
    expect(r.json().job).toMatchObject({ type: "final.render", input: { timelineId: TL, revision: 1, request: REQ } });
    const again = await final("f1");
    expect(again.statusCode).toBe(200);
    expect(again.json().job.id).toBe(r.json().job.id);
    expect(jobs.list(t.api.core.db, { projectId: "p1" }).filter((j) => j.type === "final.render")).toHaveLength(1);
  });

  it("C включённой сцены отозвана → 409 approval_required с перечнем причин, без задачи", async () => {
    t = await timelineApi();
    approvalsRepo.revokeActive(t.api.core.db, "p1", "C", `scene:${t.sceneIds[0]}`);
    const r = await final("f2");
    expect(r.statusCode).toBe(409);
    const body = r.json();
    expect(body.error).toBe("approval_required");
    expect(body.errors.map((e: { code: string }) => e.code).sort()).toEqual(["approval_required", "timeline_stale"]);
    expect(body.errors.find((e: { code: string }) => e.code === "approval_required").detail).toMatch(/sp_001/);
    expect(jobs.list(t.api.core.db, { projectId: "p1" }).filter((j) => j.type === "final.render")).toEqual([]);
  });

  it("устаревший таймлайн (новая C другой версии) → 409 timeline_stale; не текущая ревизия — тоже", async () => {
    t = await timelineApi();
    approveC(t.api.core.db, addVersion(t.api.core.db, t.sceneIds[1]!, 132).id);
    const r = await final("f3");
    expect(r.statusCode).toBe(409);
    expect(r.json()).toMatchObject({ error: "timeline_stale", errors: [expect.objectContaining({ code: "timeline_stale" })] });
    expect((await final("f4", 7)).statusCode).toBe(404);
  });

  it("blocking-проблема ревизии → 409 blocking_issues", async () => {
    t = await timelineApi();
    await t.api.inj("POST", `/api/timelines/${TL}/revisions`, okHeaders, { base_revision: 1, ops: [{ op: "move", clip_id: "clip_sp_001", start_frame: 0 }] });
    const r = await final("f5", 2);
    expect(r.statusCode).toBe(409);
    expect(r.json().error).toBe("blocking_issues");
  });

  it("места не хватит → 409 low_space; оценка показывает нужное и свободное", async () => {
    t = await timelineApi({ vars: { MS_MIN_FREE_GB: "99.5" } });
    const est = await t.api.inj("GET", `/api/timelines/${TL}/revisions/1/final/estimate?resolution=720p&quality=draft`);
    expect(est.statusCode).toBe(200);
    expect(est.json()).toMatchObject({ width: 1280, height: 720, fps: { num: 30, den: 1 }, frames: 900, ok: false });
    expect(est.json().bytes).toBeGreaterThan(0);
    const r = await final("f6");
    expect(r.statusCode).toBe(409);
    expect(r.json().error).toBe("low_space");
    expect(jobs.list(t.api.core.db, { projectId: "p1" }).filter((j) => j.type === "final.render")).toEqual([]);
  });

  it("FinalExportBody по контракту 35′: POST /api/timelines/:id/final { revision, request }", async () => {
    t = await timelineApi();
    const r = await t.api.inj("POST", `/api/timelines/${TL}/final`, key("f7"), { revision: 1, request: REQ });
    expect(r.statusCode).toBe(202);
    expect(r.json().job.type).toBe("final.render");
  });
});

const VERIFY: FinalVerifyReport = {
  probe: [], duration: { expected_frames: 900, actual_us: 30_000_000, delta_frames: 0 },
  sync: [{ word_id: "w_000024", offset_us: 8_000 }], frames: [{ frame: 10, kind: "source", psnr_db: 44.2, offset: 0 }],
  loudness: { source_lufs: -16.1, final_lufs: -16.2, delta_lu: -0.1, final_peak_db: -1.5, source_peak_db: -1.4 },
  verdict: "fail", failures: ["sync"],
};

/** Опубликованный экспорт: `final/<id>/` с файлом и `verify.json`, строка `final_exports`. */
function seedExport(id: string, o: { status?: "ready" | "failed_verification"; compare?: object } = {}) {
  const rel = artifactPaths(t.api.core.root, "p1").finalExport(id);
  const dir = join(t.api.core.root, rel);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, FINAL_FILE), "final-mp4-bytes!");
  writeFileSync(join(dir, VERIFY_FILE), JSON.stringify(VERIFY));
  if (o.compare) writeFileSync(join(dir, COMPARE_FILE), JSON.stringify(o.compare));
  finalExports.insert(t.api.core.db, {
    id, project_id: "p1", timeline_id: TL, timeline_revision: 1, approval_id: null, request: REQ, inputs_hash: "a".repeat(64),
    rel_path: `${rel}/${FINAL_FILE}`, sha256: "b".repeat(64), status: o.status ?? "failed_verification", job_id: null,
  });
}

describe("экспорты финала", () => {
  it("список и карточка: verify.json, повтор из compare.json; файл — 206 по Range с именем", async () => {
    t = await timelineApi();
    seedExport("fin_1");
    const compare = { reproduced_from: "fin_1", inputs_equal: true, probe_equal: true, frames: [{ frame: 5, psnr_db: 61.2 }], file_sha256_equal: false, verdict: "reproduced" };
    seedExport("fin_2", { status: "ready", compare });
    const list = await t.api.inj("GET", "/api/projects/p1/final-exports");
    expect(list.statusCode).toBe(200);
    expect(list.json().map((x: { id: string }) => x.id)).toEqual(["fin_2", "fin_1"]);
    const one = FinalExportDtoSchema.parse((await t.api.inj("GET", "/api/final-exports/fin_1")).json());
    expect(one).toMatchObject({ id: "fin_1", status: "failed_verification", verify: VERIFY, bytes: 16 });
    expect(one.compare).toBeUndefined();
    expect(FinalExportDtoSchema.parse((await t.api.inj("GET", "/api/final-exports/fin_2")).json()).compare).toEqual(compare);
    const part = await t.api.inj("GET", "/api/final-exports/fin_1/file", { range: "bytes=0-4" });
    expect(part.statusCode).toBe(206);
    expect(part.body).toBe("final");
    expect(part.headers["content-disposition"]).toMatch(/^attachment; filename="p1-r1-720p-30\.mp4"/);
    expect((await t.api.inj("GET", "/api/final-exports/fin_x")).statusCode).toBe(404);
  });

  it("POST reproduce → 202 final.reproduce; тот же ключ — 200; нет экспорта — 404", async () => {
    t = await timelineApi();
    seedExport("fin_1");
    const r = await t.api.inj("POST", "/api/final-exports/fin_1/reproduce", key("r1"), {});
    expect(r.statusCode).toBe(202);
    expect(r.json().job).toMatchObject({ type: "final.reproduce", project_id: "p1", input: { exportId: "fin_1" } });
    const again = await t.api.inj("POST", "/api/final-exports/fin_1/reproduce", key("r1"), {});
    expect(again.statusCode).toBe(200);
    expect((await t.api.inj("POST", "/api/final-exports/fin_x/reproduce", key("r2"), {})).statusCode).toBe(404);
  });
});
