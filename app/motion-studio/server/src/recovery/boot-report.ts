// Отчёт старта (Task 47): итог восстановления (`recoverOnStart`), был ли сбой (нет маркера чистой
// остановки) и черновики в карантине — в `boot_reports`. Баннер UI показывает последний отчёт
// со сбоем, пока человек не отметит его прочитанным.
import { storeCopiedText } from "../db/meta.js";
import type { Db } from "../db/open.js";
import * as bootReports from "../db/repos/boot-reports.js";
import { nowIso } from "../db/repos/util.js";
import type { RecoveryReport } from "../jobs/recovery.js";
import { LifecycleError } from "../projects/lifecycle.js";
import { newId } from "../scenes/ids.js";
import type { QuarantineEntry } from "./quarantine.js";

/** Сколько последних отчётов хранится. */
export const BOOT_REPORTS_KEEP = 50;

/**
 * Предупреждение старта (S20): `store_copied` — хранилище скопировано (путь корня сменился),
 * `foreign_process` — процесс задачи принадлежит другому живому серверу, не тронут.
 */
export interface BootWarning {
  kind: "store_copied" | "foreign_process";
  level: "warn";
  message: string;
  copied_from?: string;
  job_id?: string;
  pids?: number[];
  owner_pids?: number[];
}

/** `warnings` (и `foreign`) нет в отчётах до S20: читать с `?? []`. */
export type BootReportData = RecoveryReport & { crashed: boolean; quarantined: QuarantineEntry[]; warnings?: BootWarning[] };

/** Предупреждения отчёта: копия хранилища и чужие процессы восстановления. */
export function bootWarnings(recovery: RecoveryReport, copiedFrom: string | undefined): BootWarning[] {
  const out: BootWarning[] = [];
  if (copiedFrom !== undefined) out.push({ kind: "store_copied", level: "warn", message: storeCopiedText(copiedFrom), copied_from: copiedFrom });
  for (const f of recovery.foreign) {
    out.push({
      kind: "foreign_process", level: "warn", job_id: f.jobId, pids: f.pids, owner_pids: f.ownerPids,
      message: `задача ${f.jobId}: процесс принадлежит другому живому серверу (pid ${f.ownerPids.join(", ")}) — не тронут, задача заблокирована`,
    });
  }
  return out;
}
export type PersistedBootReport = bootReports.BootReportRow<BootReportData>;

export function persistBootReport(db: Db, report: BootReportData): PersistedBootReport {
  const id = newId("brp");
  bootReports.insert(db, { id, created_at: nowIso(), crashed: report.crashed, report });
  bootReports.prune(db, BOOT_REPORTS_KEEP);
  return bootReports.get<BootReportData>(db, id)!;
}

/**
 * Отчёт для центра восстановления: последний неподтверждённый со сбоем (баннер не пропадает
 * после следующего штатного старта), иначе — последний.
 */
export function latestBootReport(db: Db): PersistedBootReport | undefined {
  return bootReports.latestUnacknowledgedCrash<BootReportData>(db) ?? bootReports.latest<BootReportData>(db);
}

export function acknowledgeBootReport(db: Db, id: string): PersistedBootReport {
  if (!bootReports.get(db, id)) throw new LifecycleError("boot_report_not_found", `отчёта запуска ${id} нет`);
  bootReports.acknowledge(db, id, nowIso());
  return bootReports.get<BootReportData>(db, id)!;
}

/** Числа для баннера: возобновлено (в очереди снова или уже опубликовано), заблокировано, в карантине, не удалось. */
export function bootSummary(r: BootReportData): { recovered: number; blocked: number; quarantined: number; failed: number } {
  return { recovered: r.requeued.length + r.completed.length, blocked: r.blocked.length, quarantined: r.quarantined.length, failed: r.failed.length };
}
