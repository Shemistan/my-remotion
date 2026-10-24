// Пакеты генерации сценария (трек B, S5): утверждение B, сцены и задачи `playground.generate`.
// S1 — заглушка поставщика для `GET /projects/:id/script` (`scriptState`).
import type { ScriptBatchDto } from "@ms/contracts";
import type { Db } from "../db/open.js";

/** Пакеты генерации проекта для `ScriptStateDto.batches` (S5 заменяет тело, сигнатуру не меняет). */
export const batchesForState: (db: Db, root: string, projectId: string) => ScriptBatchDto[] = () => [];
