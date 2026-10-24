// Ошибки синхронных правок транскрипта и EDL (Task 27), плана и стиля, Approval B (Task 32). `code` — код ответа API (Task 29),
// сообщение начинается с кода. `resource_busy` — `ResourceBusyError` ArtifactStore.

/** База правки устарела: `base_revision ≠ current_revision` (409). */
export class RevisionConflictError extends Error {
  readonly code = "revision_conflict";
  readonly status = 409;
  constructor(readonly what: string, readonly base: number, readonly current: number | null) {
    super(`revision_conflict: ${what} — правка от r${base}, текущая r${current ?? "—"}`);
    this.name = "RevisionConflictError";
  }
}

export type EditErrorCode =
  | "empty_ops" | "unknown_word" | "order" | "span_too_large" | "invalid_text"
  | "unknown_decision" | "empty_cut" | "word_out_of_range" | "no_change"
  | "transcript_not_found" | "edl_not_found" | "media_not_found" | "no_edl"
  // Task 32: правка плана, стиль проекта, Approval B
  | "plan_not_found" | "unknown_item" | "anchor_in_cut" | "quote_mismatch" | "value_mismatch" | "empty_range" | "item_stale"
  | "approval_required" | "no_plan" | "plan_outdated" | "items_unresolved" | "blocking_issues";

const STATUS: Record<EditErrorCode, number> = {
  empty_ops: 422, unknown_word: 422, order: 422, span_too_large: 422, invalid_text: 422,
  unknown_decision: 422, empty_cut: 422, word_out_of_range: 422, no_change: 422,
  transcript_not_found: 404, edl_not_found: 404, media_not_found: 404, no_edl: 409,
  plan_not_found: 404, unknown_item: 422, anchor_in_cut: 422, quote_mismatch: 422, value_mismatch: 422, empty_range: 422, item_stale: 409,
  approval_required: 409, no_plan: 409, plan_outdated: 409, items_unresolved: 409, blocking_issues: 409,
};

/** Правка не применима (422) или субъекта нет (404/409); `details` — поля тела ответа API (перечни). */
export class EditError extends Error {
  readonly status: number;
  constructor(readonly code: EditErrorCode, message: string, readonly details: Record<string, unknown> = {}) {
    super(`${code}: ${message}`);
    this.name = "EditError";
    this.status = STATUS[code];
  }
}

/** Approval A нельзя дать, пока есть вырезки `proposed` (409). */
export class ProposedLeftError extends Error {
  readonly code = "proposed_left";
  readonly status = 409;
  constructor(readonly count: number) {
    super(`proposed_left: ${count} вырезок ждут решения — утвердить черновой монтаж нельзя`);
    this.name = "ProposedLeftError";
  }
}
