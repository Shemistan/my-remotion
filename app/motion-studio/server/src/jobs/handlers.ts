// Обработчики задач, общие для сервера и CLI: оба регистрируют одни и те же обработчики
// (`playground.generate` → `playgroundGenerate`). Task 18–19 дописывают сюда свои типы.
import type { Job } from "@ms/contracts";
import { renderVersion } from "@ms/render";
import type { CoreServices } from "../boot.js";
import type { GenerateResult } from "../pipeline/generate.js";
import { playgroundGenerate } from "../pipeline/playground-generate.js";
import { checkSceneDir } from "../scenes/static-check.js";
import { typecheckVersion } from "../scenes/typecheck.js";
import type { Handlers } from "./types.js";

/** Подмены пайплайна (тесты) и наблюдатели (CLI печатает прогресс и итог). */
export interface HandlerOptions {
  render?: typeof renderVersion;
  check?: typeof checkSceneDir;
  typecheck?: typeof typecheckVersion;
  skillsRoot?: string;
  watchIntervalMs?: number;
  log?: (line: string) => void;
  onGenerateResult?: (job: Job, r: GenerateResult) => void;
}

export function registerHandlers(svc: CoreServices, o: HandlerOptions = {}, extra: Handlers = {}): Handlers {
  return {
    "playground.generate": playgroundGenerate({
      deps: () => ({
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
      }),
      repo: svc.repo,
      ...(o.onGenerateResult ? { onResult: o.onGenerateResult } : {}),
    }),
    ...extra,
  };
}
