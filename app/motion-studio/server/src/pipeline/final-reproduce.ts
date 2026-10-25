// Задача `final.reproduce` (Task 43): повтор экспорта по `final-manifest.json` — те же ревизия
// таймлайна и настройки; входы (документ ревизии, EDL, план, стиль, исходник, версии сцен по
// manifest_sha256, окружение рендера, master и смонтированный звук по sha256) обязаны совпасть с
// манифестом, иначе `failed(verify_failed, "inputs_changed")` до рендера. Гейт свежести не нужен:
// повторяется прошлый экспорт, а не текущее состояние проекта. Новый экспорт публикуется как обычно
// (`final/<id>/` + `compare.json`), затем `compareExports` с исходным; `differs` — задача
// `failed(verify_failed)`, экспорт сохранён.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { FinalManifestSchema } from "@ms/contracts";
import { z } from "zod";
import { artifactPaths } from "../artifacts/paths.js";
import { finalExports } from "../db/repos/video.js";
import { compareExports } from "../final/compare.js";
import { COMPARE_FILE, FINAL_FILE, FINAL_MANIFEST_FILE } from "../final/manifest.js";
import type { JobHandler } from "../jobs/types.js";
import { fsyncWrite } from "../scenes/store.js";
import { type FinalImpl, runFinal } from "./final-render.js";
import { type Phase46Deps } from "./phase46-deps.js";
import { errText } from "./steps.js";

export type FinalReproduceDeps = Phase46Deps;

const InputSchema = z.object({ exportId: z.string().min(1) }).strict();

export function finalReproduceWith(depsOf: () => FinalReproduceDeps, impl: FinalImpl = {}): JobHandler {
  return async (ctx) => {
    const prep = (message: string) => ({ status: "failed" as const, error: { code: "pipeline" as const, stage: "prepare" as const, message } });
    const parsed = InputSchema.safeParse(ctx.job.input);
    if (!parsed.success) return prep(`вход final.reproduce не годится: ${parsed.error.message}`);
    const { exportId } = parsed.data;
    const row = finalExports.get(ctx.db, exportId);
    if (!row) return prep(`экспорта ${exportId} нет`);
    if (row.project_id !== ctx.job.project_id) return prep(`экспорт ${exportId} не из проекта задачи ${ctx.job.project_id}`);
    const deps = depsOf();
    const dir = join(deps.svc.root, artifactPaths(deps.svc.root, row.project_id).finalExport(exportId));
    let manifest;
    try {
      manifest = FinalManifestSchema.parse(JSON.parse(await readFile(join(dir, FINAL_MANIFEST_FILE), "utf8")));
    } catch (e) {
      return prep(`манифест экспорта ${exportId} не прочитан: ${errText(e)}`);
    }
    return runFinal(ctx, deps, impl, {
      timelineId: manifest.timeline.id, revision: manifest.timeline.revision, request: manifest.request, approvalId: row.approval_id, expect: manifest,
      beforePublish: async ({ draftDir, finalPath, manifest: now, workDir }) => {
        const compare = await (impl.compare ?? compareExports)({ ...manifest, path: join(dir, FINAL_FILE) }, { ...now, path: finalPath }, { workDir, run: ctx.run, signal: ctx.signal });
        await fsyncWrite(join(draftDir, COMPARE_FILE), JSON.stringify({ reproduced_from: exportId, ...compare }, null, 2) + "\n");
        const outputRefs = { reproduced_from: exportId, compare };
        if (compare.verdict === "reproduced") return { outputRefs };
        const bad = compare.frames.filter((f) => f.psnr_db < 50).map((f) => `${f.frame}: ${f.psnr_db} дБ`);
        return {
          outputRefs,
          error: {
            code: "verify_failed",
            message: `differs: повтор ${exportId} не совпал (входы ${compare.inputs_equal ? "те же" : "другие"}, ffprobe ${compare.probe_equal ? "тот же" : "другой"}${bad.length ? `, кадры ${bad.join(", ")}` : ""})`,
          },
        };
      },
    });
  };
}

export const finalReproduce: (depsOf: () => FinalReproduceDeps) => JobHandler = (depsOf) => finalReproduceWith(depsOf);
