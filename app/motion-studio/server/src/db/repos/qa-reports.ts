import type { Verdict } from "@ms/contracts";
import type { Db } from "../open.js";

export interface QaReportInsert {
  version_id: string;
  attempt: number;
  technical: Verdict;
  visual: Verdict;
  semantic: Verdict;
  style: Verdict;
  report_path: string;
}

export function insert(db: Db, r: QaReportInsert): number {
  const res = db.prepare("INSERT INTO qa_reports (version_id, attempt, technical, visual, semantic, style, report_path) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(r.version_id, r.attempt, r.technical, r.visual, r.semantic, r.style, r.report_path);
  return Number(res.lastInsertRowid);
}
