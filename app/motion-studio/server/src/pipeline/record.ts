// Журнал задачи генерации в studio.db (05 §3): прогоны агентов, рендеры, QA-отчёт версии,
// рендер-проверки компонентов KB (L5) и сообщения в чат сцены. Всё — одной транзакцией с
// fencing (`jobs.attempt` = попытка, задача `running`): устаревшая попытка ничего не пишет.
import { randomUUID } from "node:crypto";
import type { ConceptOutput, KnowledgeRef, QAReport } from "@ms/contracts";
import type { Db } from "../db/open.js";
import * as agentRuns from "../db/repos/agent-runs.js";
import * as chat from "../db/repos/chat.js";
import * as componentTests from "../db/repos/component-tests.js";
import * as qaReports from "../db/repos/qa-reports.js";
import * as renderJobs from "../db/repos/render-jobs.js";
import { tx } from "../db/tx.js";
import { fenceOk } from "../jobs/queue.js";
import type { RenderRecord } from "./fix-loop.js";
import type { AgentRunRecord } from "./steps.js";

export interface RecordParts {
  attempt: number;
  sceneId: string;
  agentRuns: AgentRunRecord[];
  renders: RenderRecord[];
  /** Опубликованная версия (id, путь относительно корня, статус). */
  version?: { id: string; number?: number; path: string; status: "ready" | "failed" };
  qa?: QAReport;
  refs: KnowledgeRef[];
  /** Версия Remotion рендера (manifest.render_env.remotion) — ключ `component_tests`. */
  remotion?: string;
  /** Сообщения в чат сцены: итог (assistant) или уточнения Concept (system). */
  messages: { role: "assistant" | "system"; text: string }[];
}

function insertAgentRuns(db: Db, jobId: string, records: AgentRunRecord[]): void {
  for (const r of records) {
    const id = `arun_${randomUUID()}`;
    agentRuns.insert(db, { id, job_id: jobId, role: r.role, model: r.usage.model || "unknown", log_dir: r.logDir, started_at: r.startedAt });
    agentRuns.finish(db, id, {
      status: r.status,
      input_tokens: r.usage.inputTokens,
      output_tokens: r.usage.outputTokens,
      cost_usd: r.usage.costUsd,
      session_id: r.sessionId,
      permission_denials: r.permissionDenials,
      finished_at: r.finishedAt,
    });
  }
}

/** Прогоны агентов фоновой задачи (script.plan, Phase 2–3), с тем же fencing, что `recordRun`. */
export function recordAgentRuns(db: Db, jobId: string, attempt: number, records: AgentRunRecord[]): boolean {
  return tx(db, () => {
    if (!fenceOk(db, jobId, attempt)) return false;
    insertAgentRuns(db, jobId, records);
    return true;
  });
}

/**
 * Пишет журнал попытки. `false` — попытка устарела (fencing): ничего не записано.
 * `component_tests` (L5): для записей KB со стратегией `reuse`/`adapt` — `rendered-ok`, если
 * версия `ready`, `rendered-fail`, если `failed` (как `tested_status` в KB).
 */
export function recordRun(db: Db, jobId: string, parts: RecordParts): boolean {
  return tx(db, () => {
    if (!fenceOk(db, jobId, parts.attempt)) return false;
    insertAgentRuns(db, jobId, parts.agentRuns);
    for (const r of parts.renders) {
      renderJobs.insert(db, {
        job_id: jobId,
        version_id: parts.version?.id ?? null,
        kind: r.kind,
        codec: r.kind === "preview" ? (r.ffprobe?.codec ?? "h264") : "png",
        width: r.width,
        height: r.height,
        fps: r.fps,
        frames: r.frames,
        output_path: r.outputPath,
        ffprobe: r.ffprobe,
        duration_ms: r.durationMs,
      });
    }
    const v = parts.version;
    if (v && parts.qa) {
      qaReports.insert(db, { version_id: v.id, attempt: parts.attempt, ...parts.qa.gate, report_path: `${v.path}/qa.json` });
    }
    if (v && parts.remotion) {
      for (const ref of parts.refs) {
        if (ref.strategy !== "reuse" && ref.strategy !== "adapt") continue;
        componentTests.upsert(db, { kb_id: ref.kb_id, remotion_version: parts.remotion, result: v.status === "ready" ? "rendered-ok" : "rendered-fail", version_id: v.id });
      }
    }
    for (const m of parts.messages) chat.add(db, { scene_id: parts.sceneId, role: m.role, text: m.text, job_id: jobId, ...(m.role === "assistant" && v ? { version_id: v.id } : {}) });
    return true;
  });
}

const VERDICT_RU: Record<string, string> = { pass: "пройден", warn: "с замечаниями", fail: "не пройден", not_checked: "не проверялся" };

/** Сообщение ассистента: номер версии, концепция, компоненты, итог QA. */
export function assistantMessage(o: {
  version?: { number?: number; status: "ready" | "failed" };
  concept?: ConceptOutput;
  refs: KnowledgeRef[];
  kitComponents?: string[];
  qa?: QAReport;
  failure?: { stage: string; message: string };
}): string {
  const lines: string[] = [];
  const n = o.version?.number !== undefined ? `Версия ${o.version.number}` : "Версия";
  lines.push(o.version?.status === "ready" ? `${n} готова.` : `${n} не удалась${o.failure ? ` (этап ${o.failure.stage}): ${o.failure.message.slice(0, 300)}` : "."}`);
  if (o.concept) lines.push(`Концепция: ${o.concept.concept}`);
  const kb = o.refs.map((r) => `${r.kb_id} (${r.strategy}, ${r.license})`);
  const kit = [...new Set(o.kitComponents ?? [])];
  if (kb.length + kit.length > 0) lines.push(`Компоненты: ${[...kit.map((k) => `motion-kit ${k}`), ...kb].join(", ")}.`);
  if (o.qa) {
    const g = o.qa.gate;
    const blocking = o.qa.issues.filter((i) => i.severity === "blocking").length;
    const warnings = o.qa.issues.filter((i) => i.severity === "warning").length;
    lines.push(
      `QA (автоматический, решение за вами): технический — ${VERDICT_RU[g.technical]}, визуальный — ${VERDICT_RU[g.visual]}, смысловой — ${VERDICT_RU[g.semantic]}, стиль — ${VERDICT_RU[g.style]}; замечаний: blocking ${blocking}, warning ${warnings}.`,
    );
  }
  return lines.join("\n");
}
