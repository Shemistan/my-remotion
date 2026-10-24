// Обработчики задач, общие для сервера и CLI: оба регистрируют одни и те же обработчики
// (`playground.generate`, `playground.edit`, `scene.restore`, `scene.export`, `media.import`,
// `asr.transcribe`, `roughcut.propose`, `roughcut.preview`, `footage.analyze`, `semantic.analyze`,
// `plan.visual`, `plan.recheck`, `script.plan`, `script.package`).
import type { Job } from "@ms/contracts";
import { DEFAULT_MIN_FREE_GB } from "@ms/core";
import { alphaAtCorner, exportVersion, renderVersion } from "@ms/render";
import type { CoreServices } from "../boot.js";
import { type AsrTranscribeDeps, asrTranscribe } from "../pipeline/asr-transcribe.js";
import { type FootageAnalyzeDeps, footageAnalyze } from "../pipeline/footage-analyze.js";
import type { GenerateResult } from "../pipeline/generate.js";
import { type MediaImportDeps, mediaImport } from "../pipeline/media-import.js";
import { planRecheck } from "../pipeline/plan-recheck.js";
import { type PlanVisualDeps, planVisual } from "../pipeline/plan-visual.js";
import { playgroundEdit } from "../pipeline/playground-edit.js";
import { type PlaygroundDeps, playgroundGenerate } from "../pipeline/playground-generate.js";
import { type RoughcutPreviewDeps, roughcutPreview } from "../pipeline/roughcut-preview.js";
import { type RoughcutProposeDeps, roughcutPropose } from "../pipeline/roughcut-propose.js";
import { type SceneExportDeps, sceneExport } from "../pipeline/scene-export.js";
import { type SemanticAnalyzeDeps, semanticAnalyze } from "../pipeline/semantic-analyze.js";
import { sceneRestore } from "../pipeline/scene-restore.js";
import { scriptPackage } from "../pipeline/script-package.js";
import { scriptPlan } from "../pipeline/script-plan.js";
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
  /** `asr.transcribe`: начало этапа (e2e убивает процесс на этапе). */
  onAsrStage?: AsrTranscribeDeps["onStage"];
  /** `roughcut.propose` / `roughcut.preview`: начало этапа (тесты отменяют на этапе). */
  onRoughcutStage?: RoughcutProposeDeps["onStage"];
  onPreviewStage?: RoughcutPreviewDeps["onStage"];
  /** `footage.analyze`: начало этапа (тесты отменяют на этапе); путь `vision-detect` (тесты). */
  onFootageStage?: FootageAnalyzeDeps["onStage"];
  visionBin?: string;
  /** `semantic.analyze`: начало этапа (тесты отменяют на этапе). */
  onSemanticStage?: SemanticAnalyzeDeps["onStage"];
  /** `plan.visual` / `plan.recheck`: начало этапа (тесты отменяют на этапе). */
  onPlanStage?: PlanVisualDeps["onStage"];
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
  // экспорт версии: задача scene.export и экспорты сцен пакета script.package (S7)
  const exporter: SceneExportDeps = {
    repo: svc.repo,
    deps: () => ({
      storage: svc.storageCheck,
      export: o.exportVersion ?? exportVersion,
      alpha: o.alpha ?? alphaAtCorner,
      timeoutMs: o.exportTimeoutMs ?? svc.config.limits.exportTimeoutMs,
      ...(o.log ? { log: o.log } : {}),
    }),
  };
  return {
    "playground.generate": playgroundGenerate({ deps, repo: svc.repo, ...(o.onGenerateResult ? { onResult: o.onGenerateResult } : {}) }),
    "playground.edit": playgroundEdit({ deps, repo: svc.repo, ...(o.onGenerateResult ? { onResult: o.onGenerateResult } : {}) }),
    "scene.restore": sceneRestore({ repo: svc.repo, deps: (ctx) => deps(ctx) }),
    "scene.export": sceneExport(exporter),
    "media.import": mediaImport(() => ({
      root: svc.root,
      media: svc.config.media,
      storage: svc.storageCheck,
      minFreeBytes: svc.minFreeBytes ?? DEFAULT_MIN_FREE_GB * 1024 ** 3,
      ...(o.onImportStage ? { onStage: o.onImportStage } : {}),
      ...(o.log ? { log: o.log } : {}),
    })),
    "asr.transcribe": asrTranscribe(() => ({
      root: svc.root,
      asr: svc.config.asr,
      storage: svc.storageCheck,
      ...(o.onAsrStage ? { onStage: o.onAsrStage } : {}),
      ...(o.log ? { log: o.log } : {}),
    })),
    "roughcut.propose": roughcutPropose(() => ({
      root: svc.root,
      config: svc.config,
      storage: svc.storageCheck,
      agents: svc.agents,
      ...(o.watchIntervalMs ? { watchIntervalMs: o.watchIntervalMs } : {}),
      ...(o.onRoughcutStage ? { onStage: o.onRoughcutStage } : {}),
      ...(o.log ? { log: o.log } : {}),
    })),
    "roughcut.preview": roughcutPreview(() => ({
      root: svc.root,
      roughcut: svc.config.roughcut,
      storage: svc.storageCheck,
      ...(o.onPreviewStage ? { onStage: o.onPreviewStage } : {}),
      ...(o.log ? { log: o.log } : {}),
    })),
    "footage.analyze": footageAnalyze(() => ({
      root: svc.root,
      config: svc.config,
      storage: svc.storageCheck,
      agents: svc.agents,
      ...(o.visionBin ? { visionBin: o.visionBin } : {}),
      ...(o.watchIntervalMs ? { watchIntervalMs: o.watchIntervalMs } : {}),
      ...(o.onFootageStage ? { onStage: o.onFootageStage } : {}),
      ...(o.log ? { log: o.log } : {}),
    })),
    "semantic.analyze": semanticAnalyze(() => ({
      root: svc.root,
      config: svc.config,
      storage: svc.storageCheck,
      agents: svc.agents,
      ...(o.watchIntervalMs ? { watchIntervalMs: o.watchIntervalMs } : {}),
      ...(o.onSemanticStage ? { onStage: o.onSemanticStage } : {}),
      ...(o.log ? { log: o.log } : {}),
    })),
    "plan.visual": planVisual(() => ({
      root: svc.root,
      config: svc.config,
      storage: svc.storageCheck,
      agents: svc.agents,
      kb: svc.kb,
      ...(o.watchIntervalMs ? { watchIntervalMs: o.watchIntervalMs } : {}),
      ...(o.onPlanStage ? { onStage: o.onPlanStage } : {}),
      ...(o.log ? { log: o.log } : {}),
    })),
    "plan.recheck": planRecheck(() => ({
      root: svc.root,
      config: svc.config,
      storage: svc.storageCheck,
      ...(o.onPlanStage ? { onStage: o.onPlanStage } : {}),
      ...(o.log ? { log: o.log } : {}),
    })),
    // сценарный проект (S1 — заглушки; S3 и S7 задают зависимости)
    "script.plan": scriptPlan(() => ({
      root: svc.root,
      config: svc.config,
      storage: svc.storageCheck,
      agents: svc.agents,
      kb: svc.kb,
      ...(o.watchIntervalMs ? { watchIntervalMs: o.watchIntervalMs } : {}),
      ...(o.log ? { log: o.log } : {}),
    })),
    "script.package": scriptPackage(() => ({ root: svc.root, storage: svc.storageCheck, exporter, ...(o.log ? { log: o.log } : {}) })),
    ...extra,
  };
}
