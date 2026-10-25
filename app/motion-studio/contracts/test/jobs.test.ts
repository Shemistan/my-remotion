import { describe, expect, it } from "vitest";
import { ChatMessageSchema, JobErrorSchema, JobSchema, JobStatusSchema, JobTypeSchema } from "../src/index.js";

function job(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "job_1", type: "playground.generate", project_id: "playground", scene_id: "scn_1", version_id: null, parent_job_id: null,
    status: "pending", progress: 0, stage: null, attempt: 0, max_attempts: 3, interrupts: 0,
    input: { prompt: "p" }, input_hash: null, output_refs: null, error: null, idempotency_key: "k1",
    lease_owner: null, lease_until: null, cancel_requested: false,
    created_at: "2026-10-21T00:00:00.000Z", started_at: null, finished_at: null,
    ...over,
  };
}

describe("jobs", () => {
  it("статусы и типы", () => {
    expect(JobStatusSchema.options).toEqual(["pending", "running", "completed", "failed", "cancelled", "awaiting_approval", "awaiting_input", "blocked"]);
    expect(JobTypeSchema.options).toEqual([
      "playground.generate", "playground.edit", "scene.restore", "scene.export",
      "media.import", "asr.transcribe", "roughcut.propose", "roughcut.preview", "footage.analyze", "semantic.analyze", "plan.visual", "plan.recheck",
      "script.plan", "script.package",
    ]);
  });
  it("JobError: коды Phase 2–3 без этапа", () => {
    for (const code of ["approval_required", "asr_unavailable", "asr_contract_changed", "asr_contract_violation", "asr_failed", "low_space", "media_invalid", "media_exists", "no_audio"]) {
      expect(JobErrorSchema.safeParse({ code, message: "x" }).success, code).toBe(true);
    }
    // сбой воркера ASR (ревью Task 26, m4): этап transcribe, код asr_failed — не «ASR не установлен»
    expect(JobErrorSchema.safeParse({ code: "asr_failed", stage: "transcribe", message: "код 3" }).success).toBe(true);
    expect(JobErrorSchema.safeParse({ code: "asr_unavailable", stage: "transcribe", message: "код 3" }).success).toBe(false);
  });
  it("Job: корректная задача, interrupts обязателен", () => {
    expect(JobSchema.safeParse(job()).success).toBe(true);
    const j = job();
    delete j.interrupts;
    expect(JobSchema.safeParse(j).success).toBe(false);
    expect(JobSchema.safeParse(job({ progress: 1.5 })).success).toBe(false);
  });
  it("JobError: код из JobErrorCode, stage из FailureStage", () => {
    expect(JobErrorSchema.safeParse({ code: "stale_process", message: "жив", stage: "orphaned", pids: [1], cmds: ["claude"] }).success).toBe(true);
    expect(JobErrorSchema.safeParse({ code: "oops", message: "x" }).success).toBe(false);
    expect(JobErrorSchema.safeParse({ code: "pipeline", message: "x", stage: "ffprobe" }).success).toBe(false);
    expect(JobSchema.safeParse(job({ status: "failed", error: { code: "pipeline", message: "x", stage: "qa" } })).success).toBe(true);
  });
  it("JobError: code согласован со stage (failureToJobErrorCode)", () => {
    expect(JobErrorSchema.safeParse({ code: "pipeline", message: "x", stage: "orphaned" }).success).toBe(false);
    expect(JobErrorSchema.safeParse({ code: "stale_process", message: "x", stage: "orphaned" }).success).toBe(true);
    expect(JobErrorSchema.safeParse({ code: "budget", message: "x", stage: "qa" }).success).toBe(false);
    expect(JobErrorSchema.safeParse({ code: "interrupted", message: "x" }).success).toBe(true);
  });
  it("ChatMessage", () => {
    const m = { id: "msg_1", scene_id: "scn_1", role: "user", text: "медленнее", created_at: "2026-10-21T00:00:00.000Z" };
    expect(ChatMessageSchema.safeParse(m).success).toBe(true);
    expect(ChatMessageSchema.safeParse({ ...m, version_id: "ver_1", job_id: "job_1" }).success).toBe(true);
    expect(ChatMessageSchema.safeParse({ ...m, role: "bot" }).success).toBe(false);
  });
});
