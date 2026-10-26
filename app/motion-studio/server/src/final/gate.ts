// Гейт финала (Task 43, F6): перед решением «Смонтировать и экспортировать» и ещё раз в обработчике
// перед публикацией (за время рендера что-то могло устареть). Только чтение: решения не помечаются
// устаревшими (`peekApprovalState`) — пометит следующая мутация.
import type { JobError } from "@ms/contracts";
import { peekApprovalState } from "../approvals/engine.js";
import { currentSubject } from "../approvals/subjects.js";
import type { Db } from "../db/open.js";
import { videoTimelines } from "../db/repos/video.js";
import { timelineFreshness } from "../timeline/freshness.js";
import { readTimelineDoc } from "../timeline/ops.js";
import { sceneApprovalState } from "../video-scenes/approval-c.js";

export type FinalGateCode = "approval_required" | "timeline_stale" | "blocking_issues";
export interface FinalGateError {
  code: FinalGateCode;
  detail: string;
}
export type FinalGate = { ok: true } | { ok: false; errors: FinalGateError[] };

export interface FinalRef {
  timelineId: string;
  revision: number;
}

/** Гейт не пройден: причины для API (409) и задачи. */
export class FinalGateFailed extends Error {
  constructor(readonly errors: FinalGateError[]) {
    super(errors.map((e) => `${e.code}: ${e.detail}`).join("; "));
    this.name = "FinalGateFailed";
  }
}

/**
 * Гейт финала: A и B валидны; ревизия `ref` — текущая ревизия таймлайна проекта и свежая
 * (`timelineFreshness`); в ней нет blocking-проблем; C каждой утверждённой сцены валидна (на какой
 * версии — сверяет свежесть: другая утверждённая версия — `version_changed`); `override` — с причиной.
 */
export function assembleGate(db: Db, root: string, projectId: string, ref: FinalRef): FinalGate {
  const errors: FinalGateError[] = [];
  const add = (code: FinalGateCode, detail: string) => errors.push({ code, detail });
  for (const kind of ["A", "B"] as const) {
    const s = peekApprovalState(db, projectId, kind, currentSubject(db, projectId, kind));
    if (s.state !== "valid") add("approval_required", `${kind === "A" ? "A (черновой монтаж)" : "B (план сцен)"}: ${s.state === "missing" ? "нет решения" : `устарело (${s.reason ?? "stale"})`}`);
  }
  const row = videoTimelines.byProject(db, projectId);
  if (!row || row.id !== ref.timelineId || row.current_revision === null) {
    add("timeline_stale", `таймлайна ${ref.timelineId} у проекта ${projectId} нет: соберите таймлайн`);
    return { ok: false, errors };
  }
  if (row.current_revision !== ref.revision) {
    add("timeline_stale", `ревизия r${ref.revision} не текущая (текущая r${row.current_revision})`);
    return { ok: false, errors };
  }
  const fresh = timelineFreshness(db, root, projectId);
  if (!fresh.fresh) add("timeline_stale", `ревизия r${ref.revision} устарела: ${fresh.reasons.join(", ")}`);
  const doc = readTimelineDoc(db, root, ref.timelineId, ref.revision);
  const blocking = doc.issues.filter((i) => i.severity === "blocking");
  if (blocking.length > 0) add("blocking_issues", blocking.map((i) => `${i.item_id}: ${i.code}`).join(", "));
  for (const c of doc.scenes) {
    if (c.include === "override") {
      if (!c.override_reason?.trim()) add("blocking_issues", `${c.item_id}: override без причины`);
      continue;
    }
    const s = sceneApprovalState(db, c.scene_id, { root });
    if (s.state !== "valid") add("approval_required", `C сцены ${c.item_id} (${c.scene_id}): ${s.state === "missing" ? "нет решения" : `устарело (${s.reason ?? "stale"})`}`);
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

/** Ошибка задачи по причинам гейта: первая причина задаёт код (`blocking_issues` — `pipeline`, этап `prepare`). */
export function gateJobError(errors: FinalGateError[]): JobError {
  const first = errors[0]!;
  const message = errors.map((e) => `${e.code}: ${e.detail}`).join("; ");
  if (first.code === "blocking_issues") return { code: "pipeline", stage: "prepare", message };
  return { code: first.code, message };
}
