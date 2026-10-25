// Task 35′ (Phase 4–6 v2): реестры основы — замки типов задач Phase 4–6, пути артефактов,
// настройки (video/final/watchdog/cache/render), заглушки обработчиков и маршрутов.
import type { Job, JobType } from "@ms/contracts";
import { describe, expect, it } from "vitest";
import { artifactPaths, checkArtifactDestRel } from "../../src/artifacts/paths.js";
import { configFileIssues, loadConfig } from "../../src/config.js";
import { SCENE_WRITING_TYPES, lockKeyFor, sceneLockFor } from "../../src/jobs/locks.js";
import { registerHandlers } from "../../src/jobs/handlers.js";
import type { CoreServices } from "../../src/boot.js";
import type { JobContext } from "../../src/jobs/types.js";

const TS = "2026-10-25T00:00:00.000Z";
function job(type: JobType, o: { projectId?: string; sceneId?: string } = {}): Job {
  return {
    id: "job_1", type, project_id: o.projectId ?? "p1", scene_id: o.sceneId ?? null, version_id: null, parent_job_id: null,
    status: "pending", progress: 0, stage: null, attempt: 0, max_attempts: 3, interrupts: 0, input: {}, input_hash: null,
    output_refs: null, error: null, idempotency_key: null, lease_owner: null, lease_until: null, cancel_requested: false,
    created_at: TS, started_at: null, finished_at: null,
  };
}

describe("lockKeyFor: Phase 4–6", () => {
  it("ресурсы проекта, превью без замка, обслуживание — замки хранилища", () => {
    expect(lockKeyFor(job("video.package", { projectId: "p1" }))).toBe("project:p1:package");
    expect(lockKeyFor(job("timeline.build", { projectId: "p1" }))).toBe("project:p1:timeline");
    expect(lockKeyFor(job("final.render", { projectId: "p1" }))).toBe("project:p1:final");
    expect(lockKeyFor(job("final.reproduce", { projectId: "p1" }))).toBe("project:p1:final");
    expect(lockKeyFor(job("timeline.preview", { projectId: "p1" }))).toBeUndefined();
    expect(lockKeyFor(job("scene.preview_context", { projectId: "p1", sceneId: "scn_1" }))).toBeUndefined();
    expect(lockKeyFor(job("trash.purge", { projectId: "p1" }))).toBe("store:trash");
    expect(lockKeyFor(job("cache.gc", { projectId: "p2" }))).toBe("store:cache");
  });

  it("видеосцены пишет playground.*: SCENE_WRITING_TYPES прежний, превью в контексте замка сцены не берёт", () => {
    expect(SCENE_WRITING_TYPES).toEqual(["playground.generate", "playground.edit", "scene.restore"]);
    expect(sceneLockFor(job("scene.preview_context", { sceneId: "scn_1" }))).toBeUndefined();
  });
});

describe("artifactPaths: Phase 4–6", () => {
  const a = artifactPaths("/r", "prj_A");
  it("таймлайн, финал, master, звук, превью в контексте", () => {
    expect(a.timelineRev("tml_1", 2)).toBe("workspace/projects/prj_A/timeline/tml_1/r2");
    expect(a.finalExport("fx_1")).toBe("workspace/projects/prj_A/final/fx_1");
    expect(a.master("med_1", { num: 30000, den: 1001 })).toBe("workspace/projects/prj_A/master/med_1@30000-1001");
    expect(a.editedAudio("edl_1", 3)).toBe("workspace/projects/prj_A/audio/edl_1/r3");
    expect(a.contextPreview("scn_1", "ver_2", 17)).toBe("workspace/projects/prj_A/context/scn_1/ver_2@r17");
    expect(a.contextPreview("scn_1", "ver_2", 17, 30)).toBe("workspace/projects/prj_A/context/scn_1/ver_2@r17-p30");
    expect(a.contextPreview("scn_1", "ver_2", 3, 0)).toBe("workspace/projects/prj_A/context/scn_1/ver_2@r3-p0");
    expect(() => a.contextPreview("scn_1", "ver_2", 0)).toThrow();
    expect(() => a.contextPreview("scn_1", "ver_2", 1, -1)).toThrow();
    expect(() => a.timelineRev("tml_1", 0)).toThrow();
    expect(() => a.master("med_1", { num: 0, den: 1 })).toThrow();
    expect(() => a.contextPreview("scn_1", "../x", 1)).toThrow();
  });

  it("destRel: новые формы — да, соседние — нет", () => {
    for (const p of [a.timelineRev("tml_1", 2), a.finalExport("fx_1"), a.master("med_1", { num: 30, den: 1 }), a.editedAudio("edl_1", 3), a.contextPreview("scn_1", "ver_2", 4), a.contextPreview("scn_1", "ver_2", 4, 60)]) {
      expect(() => checkArtifactDestRel(p), p).not.toThrow();
    }
    for (const p of ["workspace/projects/prj_A/timeline/tml_1", "workspace/projects/prj_A/final/fx_1/r1", "workspace/projects/prj_A/master/med_1@30", "workspace/projects/prj_A/proxy/med_1/master@30-1",
      "workspace/projects/prj_A/master/med_1@0-1", "workspace/projects/prj_A/master/med_1",
      "workspace/projects/prj_A/context/scn_1", "workspace/projects/prj_A/context/scn_1/ver_2", "workspace/projects/prj_A/context/scn_1/ver_2@r0",
      "workspace/projects/prj_A/context/scn_1/ver_2@r1-p", "workspace/projects/prj_A/context/scn_1/ver_2@r1-px", "workspace/projects/prj_A/audio/edl_1/r0"]) {
      expect(() => checkArtifactDestRel(p), p).toThrow();
    }
  });
});

describe("config: Phase 4–6", () => {
  it("умолчания и переопределения config.json; лишние ключи — отказ", () => {
    const c = loadConfig({ MS_DATA_DIR: "/tmp/ms-unused" });
    expect(c.video).toEqual({ contextPadFrames: 30 });
    expect(c.final).toEqual({ timeoutMs: 7_200_000, masterCrf: 12 });
    expect(c.watchdog).toEqual({ noProgressMs: {} });
    expect(c.cache).toEqual({ maxBytes: 20 * 1024 ** 3 });
    expect(c.render).toEqual({});
    const o = loadConfig({ MS_DATA_DIR: "/tmp/ms-unused" }, { video: { contextPadFrames: 15 }, final: { masterCrf: 14 }, watchdog: { noProgressMs: { "final.render": 600_000 } }, cache: { maxBytes: 1024 }, render: { concurrency: 2 } });
    expect(o.video.contextPadFrames).toBe(15);
    expect(o.final).toEqual({ timeoutMs: 7_200_000, masterCrf: 14 });
    expect(o.watchdog.noProgressMs).toEqual({ "final.render": 600_000 });
    expect(o.render.concurrency).toBe(2);
    expect(configFileIssues({ video: { pad: 1 } })).not.toEqual([]);
    expect(configFileIssues({ final: { masterCrf: 60 } })).not.toEqual([]);
    expect(configFileIssues({ watchdog: { noProgressMs: { "final.rendr": 600_000 } } })).not.toEqual([]);
    expect(configFileIssues({ watchdog: { noProgressMs: { "final.render": 600_000, "timeline.build": 60_000 } } })).toEqual([]);
  });
});

describe("заглушки обработчиков Phase 4–6", () => {
  it("зарегистрированы и честно падают с номером задачи", async () => {
    const svc = { config: loadConfig({ MS_DATA_DIR: "/tmp/ms-unused" }) } as unknown as CoreServices;
    const h = registerHandlers(svc);
    const want: Record<string, string> = {
      "video.package": "5L", "timeline.build": "42", "timeline.preview": "42",
      "final.render": "43", "final.reproduce": "43",
    };
    // Task 47: trash.purge реализован (test/projects/trash.test.ts); Task 49a: cache.gc (test/perf/cache-gc.test.ts)
    expect(h["trash.purge"]).toBeTypeOf("function");
    // Task 38-39: scene.preview_context реализован (test/pipeline/scene-preview-context.test.ts)
    expect(h["scene.preview_context"]).toBeTypeOf("function");
    expect(h["cache.gc"]).toBeTypeOf("function");
    for (const [type, task] of Object.entries(want)) {
      const r = await h[type as JobType]!({} as JobContext);
      expect(r, type).toEqual({ status: "failed", error: { code: "pipeline", stage: "prepare", message: `не реализовано: Task ${task}` } });
    }
  });
});
