// Текущий субъект approval: A — текущая ревизия EDL проекта, B — текущая ревизия плана.
// `hash` — canonicalHash документа ревизии, записанный при публикации.
import { subjectRef } from "@ms/contracts";
import type { Db } from "../db/open.js";
import * as edls from "../db/repos/edls.js";
import * as plans from "../db/repos/plans.js";

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
