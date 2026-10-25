// Таймлайн ревизии EDL из индекса БД (`timelines`/`timeline_clips`, пишет `edls.insertRevision`
// в транзакции публикации). Инвариант: равен `buildTimeline(duration, acceptedCuts(doc), fps)`.
import type { EditedTimeline } from "@ms/contracts";
import type { Db } from "../db/open.js";
import * as edls from "../db/repos/edls.js";
import { EditError } from "./errors.js";

/** Таймлайн ревизии `revision` (по умолчанию текущей) EDL `edlId`. */
export function timelineFor(db: Db, edlId: string, revision?: number): EditedTimeline {
  const e = edls.get(db, edlId);
  const rev = revision ?? e?.current_revision ?? undefined;
  const tl = e && rev !== undefined ? edls.timeline(db, edlId, rev) : undefined;
  if (!tl) throw new EditError("edl_not_found", `нет таймлайна EDL ${edlId}${rev === undefined ? "" : ` r${rev}`}`);
  return tl;
}
