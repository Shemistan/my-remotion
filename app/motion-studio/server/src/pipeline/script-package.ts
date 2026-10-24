// Задача `script.package` (трек B, S7): экспорты сцен, папка пакета, шпаргалка, манифест.
// S1 — заглушки обработчика и поставщика пакетов для `scriptState`.
import type { ScriptPackageDto } from "@ms/contracts";
import type { Db } from "../db/open.js";
import type { JobHandler } from "../jobs/types.js";

/** Зависимости обработчика (поля задаёт S7). */
export type ScriptPackageDeps = Record<string, unknown>;

export const scriptPackage: (depsOf: () => ScriptPackageDeps) => JobHandler = () => async () => ({
  status: "failed", error: { code: "pipeline", stage: "prepare", message: "not_implemented" },
});

/** Пакеты экспорта проекта для `ScriptStateDto.packages` (S7 заменяет тело, сигнатуру не меняет). */
export const packagesForState: (db: Db, root: string, projectId: string) => ScriptPackageDto[] = () => [];
