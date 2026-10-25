// Текущий субъект approval: A — текущая ревизия EDL проекта, B — текущая ревизия плана.
// `hash` — canonicalHash документа ревизии, записанный при публикации. C — версия сцены, final —
// ревизия таймлайна с настройками экспорта (Р-V4, Task 35′).
import { type FinalExportRequest, subjectRef } from "@ms/contracts";
import { canonicalHash } from "@ms/contracts/canonical";
import type { Db } from "../db/open.js";
import * as edls from "../db/repos/edls.js";
import * as plans from "../db/repos/plans.js";
import * as versions from "../db/repos/versions.js";

export function currentSubject(db: Db, projectId: string, kind: "A" | "B"): { ref: string; hash: string } | undefined {
  if (kind === "A") {
    const e = edls.byProject(db, projectId);
    const rev = e?.current_revision == null ? undefined : edls.revision(db, e.id, e.current_revision);
    return e && rev ? { ref: subjectRef("edl", e.id, rev.revision), hash: rev.hash } : undefined;
  }
  const p = plans.byProject(db, projectId);
  const rev = p?.current_revision == null ? undefined : plans.revision(db, p.id, p.current_revision);
  return p && rev ? { ref: subjectRef("plan", p.id, rev.revision), hash: rev.hash } : undefined;
}

/**
 * Субъект Approval C версии сцены: `scene:<sceneId>@r<номер версии>` + `manifest_sha256` версии.
 * Версии нет, она `failed` или сломана (`broken_reason`) — утверждать нечего: `undefined`.
 */
export function sceneSubject(db: Db, versionId: string): { ref: string; hash: string } | undefined {
  const v = versions.get(db, versionId);
  if (!v || v.status === "failed" || v.broken_reason !== null) return undefined;
  return { ref: subjectRef("scene", v.scene_id, v.number), hash: v.manifest_sha256 };
}

/** Субъект final: `timeline:<id>@r<N>` + `canonicalHash(настроек экспорта)` — новый экспорт с другими настройками — новое решение. */
export function finalSubject(timelineId: string, revision: number, request: FinalExportRequest): { ref: string; hash: string } {
  return { ref: subjectRef("timeline", timelineId, revision), hash: canonicalHash(request) };
}
