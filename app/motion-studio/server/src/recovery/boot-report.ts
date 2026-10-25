// Отчёт старта (Task 47): итог восстановления (`recoverOnStart`), был ли сбой (нет маркера чистой
// остановки) и черновики в карантине — в `boot_reports`. Баннер UI показывает последний отчёт
// со сбоем, пока человек не отметит его прочитанным.
import type { Db } from "../db/open.js";
import * as bootReports from "../db/repos/boot-reports.js";
import { nowIso } from "../db/repos/util.js";
import type { RecoveryReport } from "../jobs/recovery.js";
import { LifecycleError } from "../projects/lifecycle.js";
import { newId } from "../scenes/ids.js";
import type { QuarantineEntry } from "./quarantine.js";

/** Сколько последних отчётов хранится. */
export const BOOT_REPORTS_KEEP = 50;

export type BootReportData = RecoveryReport & { crashed: boolean; quarantined: QuarantineEntry[] };
export type PersistedBootReport = bootReports.BootReportRow<BootReportData>;

export function persistBootReport(db: Db, report: BootReportData): PersistedBootReport {
  const id = newId("brp");
  bootReports.insert(db, { id, created_at: nowIso(), crashed: report.crashed, report });
  bootReports.prune(db, BOOT_REPORTS_KEEP);
  return bootReports.get<BootReportData>(db, id)!;
}

export function latestBootReport(db: Db): PersistedBootReport | undefined {
  return bootReports.latest<BootReportData>(db);
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
