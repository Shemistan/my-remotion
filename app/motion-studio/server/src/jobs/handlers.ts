// Обработчики задач, общие для сервера и CLI: оба регистрируют одни и те же обработчики
// (`playground.generate`, `playground.edit`, `scene.restore`, `scene.export`, `media.import`).
import type { Job } from "@ms/contracts";
import { DEFAULT_MIN_FREE_GB } from "@ms/core";
import { alphaAtCorner, exportVersion, renderVersion } from "@ms/render";
import type { CoreServices } from "../boot.js";
import type { GenerateResult } from "../pipeline/generate.js";
import { type MediaImportDeps, mediaImport } from "../pipeline/media-import.js";
import { playgroundEdit } from "../pipeline/playground-edit.js";
import { type PlaygroundDeps, playgroundGenerate } from "../pipeline/playground-generate.js";
import { sceneExport } from "../pipeline/scene-export.js";
import { sceneRestore } from "../pipeline/scene-restore.js";
import { checkSceneDir } from "../scenes/static-check.js";
import { typecheckVersion } from "../scenes/typecheck.js";
import type { Handlers } from "./types.js";

/** Подмены пайплайна (тесты) и наблюдатели (CLI печатает прогресс и итог). */
export interface HandlerOptions {
  render?: typeof renderVersion;
  exportVersion?: typeof exportVersion;
  alpha?: typeof alphaAtCorner;
  /** Таймаут экспорта, мс; по умолчанию `config.limits.exportTimeoutMs` (Task 20). */
  exportTimeoutMs?: number;
  check?: typeof checkSceneDir;
  typecheck?: typeof typecheckVersion;
  skillsRoot?: string;
  watchIntervalMs?: number;
  log?: (line: string) => void;
  onGenerateResult?: (job: Job, r: GenerateResult) => void;
  /** `media.import`: начало этапа (тесты прерывают попытку). */
  onImportStage?: MediaImportDeps["onStage"];
}

export function registerHandlers(svc: CoreServices, o: HandlerOptions = {}, extra: Handlers = {}): Handlers {
  const deps: PlaygroundDeps["deps"] = () => ({
    storage: svc.storageCheck,
    kb: svc.kb,
    agents: svc.agents,
    render: o.render ?? renderVersion,
    check: o.check ?? checkSceneDir,
    typecheck: o.typecheck ?? typecheckVersion,
    config: svc.config,
    ...(o.skillsRoot ? { skillsRoot: o.skillsRoot } : {}),
    ...(o.watchIntervalMs ? { watchIntervalMs: o.watchIntervalMs } : {}),
    ...(o.log ? { log: o.log } : {}),
  });
  return {
    "playground.generate": playgroundGenerate({ deps, repo: svc.repo, ...(o.onGenerateResult ? { onResult: o.onGenerateResult } : {}) }),
    "playground.edit": playgroundEdit({ deps, repo: svc.repo, ...(o.onGenerateResult ? { onResult: o.onGenerateResult } : {}) }),
    "scene.restore": sceneRestore({ repo: svc.repo, deps: (ctx) => deps(ctx) }),
    "scene.export": sceneExport({
      repo: svc.repo,
      deps: () => ({
        storage: svc.storageCheck,
        export: o.exportVersion ?? exportVersion,
        alpha: o.alpha ?? alphaAtCorner,
        timeoutMs: o.exportTimeoutMs ?? svc.config.limits.exportTimeoutMs,
        ...(o.log ? { log: o.log } : {}),
      }),
    }),
    "media.import": mediaImport(() => ({
      root: svc.root,
      media: svc.config.media,
      storage: svc.storageCheck,
      minFreeBytes: svc.minFreeBytes ?? DEFAULT_MIN_FREE_GB * 1024 ** 3,
      ...(o.onImportStage ? { onStage: o.onImportStage } : {}),
      ...(o.log ? { log: o.log } : {}),
    })),
    ...extra,
  };
}
