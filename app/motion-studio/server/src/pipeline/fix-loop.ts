// Цикл Engineer → технический gate → рендер → QA (04 §2). Один счётчик исправлений
// `scene.maxAutoFixes` на технический gate и QA. Технический gate: граница draft, отказы
// прав, static check (до typecheck, R16), typecheck, provenance, контракт props (H4),
// рендер кадров QA и превью, probe gate. QA по реальным кадрам (Task 16): программные
// проверки, проверки spec, Visual QA; исправление вызывают только blocking-замечания,
// warnings идут Engineer подсказками вместе с ними, но цикл не запускают.
import { existsSync } from "node:fs";
import { readFile, readdir, readlink, stat, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import {
  type EngineerReport,
  EngineerReportSchema,
  type FailureStage,
  type KnowledgeRef,
  type MotionSpec,
  type QAIssue,
  type QAReport,
  type ScenePropsBase,
  ScenePropsBaseSchema,
  type ScenePropsStyle,
  ScenePropsStyleSchema,
  type Settings,
} from "@ms/contracts";
import { type RenderRequest, type RenderResult, type renderVersion, probeGate } from "@ms/render";
import { programmaticChecks } from "../qa/programmatic.js";
import { fixHints, mergeQA, qaBlocks } from "../qa/report.js";
import { specChecks } from "../qa/spec-checks.js";
import { runVisualQA } from "../qa/visual-agent.js";
import { sha256File } from "../scenes/hash.js";
import type { checkSceneDir } from "../scenes/static-check.js";
import type { typecheckVersion } from "../scenes/typecheck.js";
import { provenanceGate } from "./provenance.js";
import type { KnowledgeSource } from "./refs.js";
import { type RunCtx, buildEngineerTask, clip, errText, isStorageError, scenePropsStyle, sceneStyle } from "./steps.js";

export const PREVIEW = { scale: 0.5, crf: 23 };
const RENDER_TIMEOUT_MS = 5 * 60_000;
/** Вызовов Visual QA на один рендер: первый и один повтор (ruling P5). */
const VISUAL_QA_TRIES = 2;
const EDIT_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

/** Причина исправления: этап и текст для Engineer. */
export interface Issue {
  stage: FailureStage;
  message: string;
}

/** Рендер для журнала задачи (`render_jobs`). */
export interface RenderRecord {
  kind: "still" | "preview";
  frames: number;
  width: number;
  height: number;
  fps: Settings["fps"];
  outputPath: string;
  ffprobe?: RenderResult["probe"];
  durationMs: number;
}

/** Вызов Visual QA: время по часам (`wallMs`, Task 16), стоимость, итог. */
export interface VisualQaRun {
  call: number;
  wall_ms: number;
  cost_usd: number;
  status: string;
  gate?: QAReport["gate"];
}

/**
 * Итог работы после создания draft. `alive` — процесс агента или рендера не завершён
 * подтверждённо (отказ вызова, orphaned): draft только в карантин.
 */
export type Exit =
  | { ok: true; previewSha: string; framesSha: string[]; qa?: QAReport }
  | { ok: false; stage: FailureStage; message: string; alive?: boolean; qa?: QAReport };

/** Файлы пайплайна в draft: пишутся из памяти, восстанавливаются после нарушения границы. */
export interface DraftFiles {
  write(): Promise<void>;
  set(name: string, text: string): void;
  restore(before: Map<string, string>, d: ZoneDiff): Promise<void>;
}

export interface LoopDeps {
  kb: Pick<KnowledgeSource, "getCapability">;
  render: typeof renderVersion;
  check: typeof checkSceneDir;
  typecheck: typeof typecheckVersion;
}

export interface LoopInput {
  rc: RunCtx;
  deps: LoopDeps;
  draftDir: string;
  cacheDir: string;
  settings: Settings;
  spec: MotionSpec;
  refs: KnowledgeRef[];
  frames: number[];
  files: DraftFiles;
  /**
   * Полный gate задачи: provenance, контракт props (H4) и QA по кадрам. Без него — только
   * технический gate среза (static, typecheck, рендер, probe).
   */
  qa?: { brief: unknown; allowRestricted: boolean };
  progress?: (p: number, stage: string) => void;
}

/** Итоги цикла для журнала и публикации. */
export interface LoopState {
  engineerCalls: number;
  renders: RenderRecord[];
  visualQa: VisualQaRun[];
  report?: EngineerReport;
  /** `props.style` после нормализации (для style.json). */
  style?: ScenePropsStyle;
  deniedLog: unknown[];
}

/** Зона Engineer в draft: `src/**` и `props.json`. Всё остальное — файлы пайплайна. */
function engineerZone(rel: string): boolean {
  return rel === "src" || rel.startsWith("src/") || rel === "props.json";
}

/** Снимок draft вне зоны Engineer: путь → `dir` | `file:<sha256>` | `link:<цель>` | `special`. */
export async function snapshotOutsideZone(dir: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const walk = async (rel: string): Promise<void> => {
    const entries = await readdir(rel ? join(dir, rel) : dir, { withFileTypes: true });
    for (const e of entries) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (engineerZone(r)) continue;
      const abs = join(dir, r);
      if (e.isSymbolicLink()) out.set(r, `link:${await readlink(abs)}`);
      else if (e.isDirectory()) {
        out.set(r, "dir");
        await walk(r);
      } else if (e.isFile()) out.set(r, `file:${await sha256File(abs)}`);
      else out.set(r, "special");
    }
  };
  await walk("");
  return out;
}

export interface ZoneDiff {
  added: string[];
  changed: string[];
  removed: string[];
}

export function diffSnapshots(before: Map<string, string>, after: Map<string, string>): ZoneDiff {
  const d: ZoneDiff = { added: [], changed: [], removed: [] };
  for (const [p, v] of after) {
    if (!before.has(p)) d.added.push(p);
    else if (before.get(p) !== v) d.changed.push(p);
  }
  for (const p of before.keys()) if (!after.has(p)) d.removed.push(p);
  for (const k of ["added", "changed", "removed"] as const) d[k].sort();
  return d;
}

export function describeDiff(d: ZoneDiff): string {
  const part = (what: string, xs: string[]) => (xs.length > 0 ? `${what}: ${xs.slice(0, 20).join(", ")}${xs.length > 20 ? ` (+${xs.length - 20})` : ""}` : "");
  return [part("добавлены", d.added), part("изменены", d.changed), part("удалены", d.removed)].filter(Boolean).join("; ");
}

/** Отказ касается записи внутри draft (Write/Edit по пути в workdir) — rulings п. 14. */
function deniedWriteInside(denial: unknown, workdir: string): boolean {
  const d = denial as { tool_name?: unknown; tool_input?: { file_path?: unknown; path?: unknown } } | null;
  if (!d || typeof d.tool_name !== "string" || !EDIT_TOOLS.has(d.tool_name)) return false;
  const p = d.tool_input?.file_path ?? d.tool_input?.path;
  if (typeof p !== "string") return true; // запись без пути — считаем отказом внутри
  const abs = resolve(workdir, p);
  return abs === resolve(workdir) || abs.startsWith(resolve(workdir) + sep);
}

/** Пути `files_written`, которых нет внутри draft (или они вне его). */
function missingWritten(report: EngineerReport, workdir: string): string[] {
  const root = resolve(workdir);
  return report.files_written.filter((p) => {
    const abs = resolve(root, p);
    if (!(abs === root || abs.startsWith(root + sep))) return true;
    return !existsSync(abs);
  });
}

export function describeDenial(d: unknown): string {
  const x = d as { tool_name?: unknown; tool_input?: Record<string, unknown> } | null;
  const target = x?.tool_input ? (x.tool_input.file_path ?? x.tool_input.path ?? x.tool_input.pattern ?? "") : "";
  return `${String(x?.tool_name ?? "?")} ${String(target)}`.trim();
}

const technical = (code: string, description: string, fix_hint: string, severity: QAIssue["severity"] = "blocking"): QAIssue => ({
  source: "technical", code, severity, description, fix_hint,
});

/**
 * Контракт props (Task 11, H4). `props.style` перезаписывается из настроек
 * (`scenePropsStyle`; `palette_overrides` и `depth` сцены сохраняются — их меняет правка
 * параметров), затем `ScenePropsBaseSchema` и согласованность: `props.timing.duration_frames
 * == spec.duration_frames == settings.duration_frames`, `props.style.{preset, intensity,
 * transparent} == settings.*` — иначе blocking `props_settings_mismatch`. Биты props, не
 * совпавшие с биты spec, — warning.
 */
export function checkProps(text: string | undefined, spec: MotionSpec, settings: Settings): { props?: ScenePropsBase; text?: string; issues: QAIssue[] } {
  if (text === undefined) return { issues: [technical("props_contract", "props.json нет", "запиши props.json: { timing, style, content } по контракту сцены")] };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { issues: [technical("props_contract", `props.json — не JSON: ${errText(e)}`, "props.json — JSON-объект { timing, style, content }")] };
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { issues: [technical("props_contract", "props.json — не объект", "props.json — JSON-объект { timing, style, content }")] };
  }
  const obj = raw as Record<string, unknown>;
  const own = ScenePropsStyleSchema.partial().safeParse(obj.style);
  const kept = own.success ? own.data : {};
  const style: ScenePropsStyle = {
    ...scenePropsStyle(settings),
    ...(kept.palette_overrides ? { palette_overrides: kept.palette_overrides } : spec.palette_overrides ? { palette_overrides: spec.palette_overrides } : {}),
    ...(kept.depth !== undefined ? { depth: kept.depth } : {}),
  };
  const parsed = ScenePropsBaseSchema.safeParse({ ...obj, style });
  if (!parsed.success) {
    const where = parsed.error.issues.slice(0, 8).map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`).join("; ");
    return { issues: [technical("props_contract", `props.json не проходит ScenePropsBaseSchema: ${where}`, "props.json — ровно { timing: { duration_frames, beats: [{ id, start_frame, end_frame }] }, style, content }, без лишних полей")] };
  }
  const props = parsed.data;
  const issues: QAIssue[] = [];
  const mismatch: string[] = [];
  if (props.timing.duration_frames !== settings.duration_frames) mismatch.push(`props.timing.duration_frames ${props.timing.duration_frames} ≠ settings.duration_frames ${settings.duration_frames}`);
  if (spec.duration_frames !== settings.duration_frames) mismatch.push(`spec.duration_frames ${spec.duration_frames} ≠ settings.duration_frames ${settings.duration_frames}`);
  if (props.style.preset !== settings.style_preset) mismatch.push(`props.style.preset ${props.style.preset} ≠ ${settings.style_preset}`);
  if (props.style.intensity !== settings.animation_intensity) mismatch.push(`props.style.intensity ${props.style.intensity} ≠ ${settings.animation_intensity}`);
  if (props.style.transparent !== settings.transparent_export) mismatch.push(`props.style.transparent ${props.style.transparent} ≠ ${settings.transparent_export}`);
  if (mismatch.length > 0) {
    issues.push(technical("props_settings_mismatch", mismatch.join("; "), "props.timing — биты и duration_frames ровно как в spec.json и settings.json; тайминги сцены — только из props.timing"));
  }
  const specBeats = new Map(spec.beats.map((b) => [b.id, b]));
  const odd = props.timing.beats.filter((b) => {
    const s = specBeats.get(b.id);
    return !s || s.start_frame !== b.start_frame || s.end_frame !== b.end_frame;
  });
  const lost = spec.beats.filter((b) => !props.timing.beats.some((x) => x.id === b.id));
  if (odd.length + lost.length > 0) {
    issues.push(technical(
      "props_timing",
      `props.timing.beats расходятся со spec: ${[...odd.map((b) => `${b.id} ${b.start_frame}–${b.end_frame}`), ...lost.map((b) => `нет ${b.id}`)].join(", ")}`,
      "перенеси в props.timing.beats все биты spec с их start_frame и end_frame",
      "warning",
    ));
  }
  return { props, text: JSON.stringify(props, null, 2) + "\n", issues };
}

const asText = (issues: QAIssue[]) => issues.map((i) => `- [${i.severity}] ${i.code}${i.area ? ` (${i.area})` : ""}: ${i.description} → ${i.fix_hint}`).join("\n");

export async function runFixLoop(i: LoopInput, state: LoopState): Promise<Exit> {
  const { rc, deps, draftDir, settings, spec, frames } = i;
  const maxCalls = 1 + rc.config.scene.maxAutoFixes;
  let issue: Issue | undefined;
  let lastQa: QAReport | undefined;
  const failed = (stage: FailureStage, message: string, extra: { alive?: boolean } = {}): Exit => ({ ok: false, stage, message, ...extra, ...(lastQa ? { qa: lastQa } : {}) });
  const push = (x: Issue) => {
    issue = x;
    rc.note(x.stage, x.message);
  };

  for (let call = 1; call <= maxCalls; call++) {
    if (rc.spent >= rc.config.scene.maxCostUsd) {
      const why = issue ? `; последняя ошибка (${issue.stage}): ${clip(issue.message, 1000)}` : "";
      return failed("budget", `бюджет сцены исчерпан: $${rc.spent.toFixed(2)} из $${rc.config.scene.maxCostUsd}${why}`);
    }
    const p = await rc.storageProblem();
    if (p) return failed("storage", p);
    if (rc.aborted) return failed("cancelled", "отменено");

    state.engineerCalls++;
    i.progress?.(0.3 + 0.15 * (call - 1), call === 1 ? "engineer" : `engineer_fix_${call - 1}`);
    const zoneBefore = await snapshotOutsideZone(draftDir);
    const fix = call > 1 && issue
      ? [
          `# Исправление ${call - 1} из ${maxCalls - 1}`,
          `Предыдущая версия не прошла этап «${issue.stage}». Прочитай текущие файлы src/ и props.json, исправь причины и всё, что им подобно. Не переписывай сцену с нуля без нужды и не упрощай замысел.`,
          "",
          "## Причины",
          "```",
          clip(issue.message),
          "```",
        ].join("\n")
      : undefined;
    rc.log(call === 1 ? "Engineer…" : `Engineer: исправление ${call - 1} из ${maxCalls - 1} (${issue?.stage})…`);
    const e = await rc.timed(`engineer_${call}`, () => rc.call(buildEngineerTask({ draftDir, fix }, { ...rc.taskRun, seq: call }), EngineerReportSchema));
    if (e.skipped) return failed("cancelled", "отменено до Engineer");
    if (e.error !== undefined) {
      // процесс агента мог остаться: подтверждения его смерти нет
      const storage = isStorageError(e.error) || e.lost !== undefined || (await rc.storageProblem()) !== undefined;
      return failed(storage ? "storage" : "engineer", `вызов Engineer отклонён: ${errText(e.error)}`, { alive: true });
    }
    const er = e.value!;
    if (er.error?.kind === "orphaned") return failed("orphaned", `Engineer: ${er.error.message}`, { alive: true });
    if (e.lost) return failed("storage", `хранилище пропало во время Engineer: ${e.lost}`);
    if (rc.aborted) return failed("cancelled", "отменено во время Engineer");

    // Граница draft: Engineer правит только src/** и props.json. Остальное (файлы
    // пайплайна, refs/, node_modules, package.json рядом с src/) меняло бы сборку
    // или опубликованные данные в обход static check — откат и причина на исправление.
    const zoneDiff = diffSnapshots(zoneBefore, await snapshotOutsideZone(draftDir));
    if (zoneDiff.added.length + zoneDiff.changed.length + zoneDiff.removed.length > 0) {
      const what = describeDiff(zoneDiff);
      await i.files.restore(zoneBefore, zoneDiff);
      rc.warnings.push(`Engineer писал вне src/ и props.json (откачено): ${what}`);
      push({
        stage: "static",
        message: `[draft-boundary] изменения вне src/ и props.json запрещены и откачены пайплайном: ${what}. ` +
          "Код сцены и ассеты — только в src/ (без node_modules и package.json), данные — в props.json; spec.json, settings.json, style.json, selection.json, knowledge-refs.json и refs/ не трогай.",
      });
      rc.log(`граница draft: ${what}`);
      continue;
    }

    if (er.permissionDenials.length > 0) {
      state.deniedLog.push(...er.permissionDenials);
      const w = `Engineer: отказано в доступе (${er.permissionDenials.length}): ${er.permissionDenials.map(describeDenial).join("; ")}`;
      rc.warnings.push(w);
      rc.log(`⚠ ${w}`);
      const inside = er.permissionDenials.filter((x) => deniedWriteInside(x, draftDir));
      if (inside.length > 0) return failed("engineer", `denied: запись внутри draft отклонена: ${inside.map(describeDenial).join("; ")}`);
    }
    if (er.status !== "completed" || !er.output) {
      push({ stage: "engineer", message: `вызов Engineer завершился ${er.status}${er.error ? ` (${er.error.kind}): ${er.error.message}` : ""}` });
      continue;
    }
    state.report = er.output;
    const missing = missingWritten(er.output, draftDir);
    if (missing.length > 0) return failed("engineer", `denied: files_written ссылается на несуществующие файлы: ${missing.join(", ")}`);

    // static check — до typecheck и бандла (rulings п. 16)
    const violations = await rc.timed("static", () => deps.check(draftDir));
    if (violations.length > 0) {
      push({ stage: "static", message: violations.map((v) => `${v.file}:${v.line} [${v.rule}] ${v.message}`).join("\n") });
      rc.log(`static check: ${violations.length} нарушений`);
      continue;
    }
    const typeErrors = await rc.timed("typecheck", () => deps.typecheck(draftDir));
    if (typeErrors.length > 0) {
      push({ stage: "typecheck", message: typeErrors.map((t) => `${t.file}:${t.line} ${t.message}`).join("\n") });
      rc.log(`typecheck: ${typeErrors.length} ошибок`);
      continue;
    }

    // provenance и контракт props (H4) — технический gate до рендера
    const techWarnings: QAIssue[] = [];
    if (i.qa) {
      const prov = provenanceGate(er.output, i.refs, deps.kb, i.qa.allowRestricted);
      if (prov.length > 0) {
        push({ stage: "static", message: asText(prov) });
        rc.log(`provenance: ${prov.map((x) => x.code).join(", ")}`);
        continue;
      }
      const propsPath = join(draftDir, "props.json");
      const checked = checkProps(existsSync(propsPath) ? await readFile(propsPath, "utf8") : undefined, spec, settings);
      const blocking = checked.issues.filter((x) => x.severity === "blocking");
      if (blocking.length > 0 || !checked.props) {
        push({ stage: "static", message: asText(checked.issues) });
        rc.log(`props: ${checked.issues.map((x) => x.code).join(", ")}`);
        continue;
      }
      techWarnings.push(...checked.issues);
      // нормализованный props.style — в props.json и style.json (что сцена увидит, то и QA)
      await writeFile(propsPath, checked.text!);
      state.style = checked.props.style;
      i.files.set("style.json", JSON.stringify(sceneStyle(checked.props.style, settings), null, 2) + "\n");
      await i.files.write();
    }

    const rp = await rc.storageProblem();
    if (rp) return failed("storage", rp);
    i.progress?.(0.55, "render");
    rc.log(`рендер: кадры ${frames.join(", ")} + превью…`);
    const req: RenderRequest = {
      versionDir: draftDir, settings, cacheDir: i.cacheDir, stills: frames, preview: PREVIEW, timeoutMs: RENDER_TIMEOUT_MS,
      run: { root: rc.root, runId: rc.runId, attempt: rc.attempt, registry: rc.registry },
    };
    const t0 = Date.now();
    const r = await rc.timed(`render_${call}`, () =>
      rc.underWatch(async (sig) => {
        const release = await rc.acquire(rc.deps.permits?.renders, sig);
        try {
          return await deps.render(req, sig);
        } finally {
          release();
        }
      }),
    );
    if (r.skipped) return failed("cancelled", "отменено до рендера");
    if (r.error !== undefined) {
      const storage = isStorageError(r.error) || r.lost !== undefined || (await rc.storageProblem()) !== undefined;
      return failed(storage ? "storage" : "render", `рендер отклонён: ${errText(r.error)}`, { alive: true });
    }
    const rr = r.value!;
    if (rr.error?.stage === "orphaned") return failed("orphaned", `рендер: ${rr.error.message}`, { alive: true });
    if (r.lost) return failed("storage", `хранилище пропало во время рендера: ${r.lost}`);
    if (rc.aborted) return failed("cancelled", "отменено во время рендера");
    const consoleErrors = rr.browserLogs.filter((l) => l.startsWith("[error]"));
    if (!rr.ok || !rr.probe || !rr.previewPath) {
      const err = rr.error ?? { stage: "media", message: "рендер не вернул превью" };
      const logs = consoleErrors.length > 0 ? `\nконсоль браузера:\n${consoleErrors.slice(-20).join("\n")}` : "";
      push({ stage: "render", message: `${err.stage}: ${err.message}${logs}` });
      rc.log(`рендер: ${err.stage}`);
      continue;
    }
    const ms = Date.now() - t0;
    state.renders.push(
      { kind: "still", frames: rr.stills.length, width: settings.width, height: settings.height, fps: settings.fps, outputPath: join(draftDir, "frames"), durationMs: ms },
      { kind: "preview", frames: settings.duration_frames, width: rr.probe.width, height: rr.probe.height, fps: settings.fps, outputPath: rr.previewPath, ffprobe: rr.probe, durationMs: ms },
    );
    const gate = probeGate(rr.probe, settings, PREVIEW.scale);
    if (gate.length > 0) {
      push({ stage: "probe", message: `превью не прошло проверку ffprobe: ${gate.join("; ")}` });
      continue;
    }
    if (consoleErrors.length > 0) rc.warnings.push(`консоль браузера: ${consoleErrors.slice(0, 5).join(" | ")}`);

    // QA по реальным кадрам (Task 16)
    if (i.qa) {
      i.progress?.(0.7, "qa");
      const q = await runQa(i, state, rr, techWarnings, call);
      if ("exit" in q) return q.exit;
      lastQa = q.report;
      if (qaBlocks(q.report)) {
        const blocking = q.report.issues.filter((x) => x.severity === "blocking");
        push({ stage: "qa", message: fixHints(q.report) });
        rc.log(`QA: blocking ${blocking.map((x) => `${x.code}${x.frame !== undefined ? `@${x.frame}` : ""}`).join(", ") || Object.entries(q.report.gate).filter(([, v]) => v === "fail").map(([k]) => `gate.${k}`).join(", ")}`);
        continue;
      }
    }

    const framesSha: string[] = [];
    for (const s of rr.stills) framesSha.push(await sha256File(s));
    const previewSha = await sha256File(rr.previewPath);
    rc.note("ready", `gate пройден с вызова ${call}`);
    return { ok: true, previewSha, framesSha, ...(lastQa ? { qa: lastQa } : {}) };
  }
  const last = issue!;
  if (last.stage === "qa" && lastQa) {
    const blocking = lastQa.issues.filter((x) => x.severity === "blocking");
    return failed("qa", `QA: blocking после ${maxCalls - 1} исправлений: ${clip(blocking.map((x) => `${x.code}${x.frame !== undefined ? ` (кадр ${x.frame})` : ""}: ${x.description}`).join("; ") || "gate fail", 4000)}`);
  }
  return failed(last.stage, clip(last.message, 4000));
}

/** Программные проверки, проверки spec и Visual QA по кадрам рендера → QAReport (или выход). */
async function runQa(i: LoopInput, state: LoopState, rr: RenderResult, techWarnings: QAIssue[], call: number): Promise<{ report: QAReport } | { exit: Exit }> {
  const { rc, settings, spec, frames, draftDir } = i;
  const style = sceneStyle(state.style ?? scenePropsStyle(settings), settings);
  const stills = frames.map((f, k) => ({ frame: f, path: rr.stills[k]! }));
  const previewBytes = rr.previewPath ? (await stat(rr.previewPath)).size : 0;
  const programmatic = await rc.timed("qa_programmatic", () => programmaticChecks({ frames: stills, spec, settings, style, render: rr, previewBytes }));
  const fromSpec = specChecks(spec, settings);

  // ruling P5: QA по реальным кадрам обязателен. Бюджет кончился до Visual QA — `budget`;
  // Visual QA не дал оценки — один повтор (без исправления Engineer), затем `qa`. Обе
  // неудачи публикуют failed-версию с отчётом программных проверок.
  const partial = () => mergeQA({ technical: techWarnings, programmatic: [...programmatic, ...fromSpec] });
  let agent: Parameters<typeof mergeQA>[0]["agent"];
  for (let attempt = 1; agent === undefined; attempt++) {
    if (rc.spent >= rc.config.scene.maxCostUsd) {
      return { exit: { ok: false, stage: "budget", message: `бюджет сцены исчерпан до Visual QA: $${rc.spent.toFixed(2)} из $${rc.config.scene.maxCostUsd}`, qa: partial() } };
    }
    const p = await rc.storageProblem();
    if (p) return { exit: { ok: false, stage: "storage", message: p } };
    rc.log(attempt === 1 ? "Visual QA…" : "Visual QA: повтор…");
    const before = rc.spent;
    const v = await rc.timed(`visual_qa_${call}`, () =>
      rc.underWatch((sig) =>
        runVisualQA(
          { workdir: draftDir, frames, spec, style, brief: i.qa!.brief, runRef: { root: rc.root, runId: rc.runId, attempt: rc.attempt }, signal: sig },
          { agents: rc.recording, config: rc.config, log: (m) => rc.warnings.push(m) },
        ),
      ),
    );
    if (v.skipped) return { exit: { ok: false, stage: "cancelled", message: "отменено до Visual QA" } };
    if (v.error !== undefined) {
      // вызов отклонён: процесс агента не подтверждён мёртвым — без повтора, draft в карантин
      const storage = isStorageError(v.error) || v.lost !== undefined || (await rc.storageProblem()) !== undefined;
      return { exit: { ok: false, stage: storage ? "storage" : "qa", message: `вызов Visual QA отклонён: ${errText(v.error)}`, alive: true } };
    }
    const vr = v.value!;
    state.visualQa.push({ call, wall_ms: vr.wallMs, cost_usd: rc.spent - before, status: vr.status, ...(vr.output ? { gate: { technical: "pass", ...vr.output.gate } } : {}) });
    if (vr.error?.kind === "orphaned") return { exit: { ok: false, stage: "orphaned", message: `Visual QA: ${vr.error.message}`, alive: true } };
    if (v.lost) return { exit: { ok: false, stage: "storage", message: `хранилище пропало во время Visual QA: ${v.lost}` } };
    if (rc.aborted) return { exit: { ok: false, stage: "cancelled", message: "отменено во время Visual QA" } };
    if (vr.status === "completed" && vr.output) {
      agent = vr.output;
      break;
    }
    const why = `Visual QA не дал оценки: ${vr.status}${vr.error ? ` (${vr.error.kind}): ${vr.error.message}` : ""}`;
    rc.warnings.push(why);
    rc.note("qa", why);
    if (attempt >= VISUAL_QA_TRIES) {
      return { exit: { ok: false, stage: "qa", message: `${why} (вызовов: ${attempt}); без оценки по кадрам версия не ready`, qa: partial() } };
    }
  }
  const report = mergeQA({ technical: techWarnings, programmatic: [...programmatic, ...fromSpec], agent });
  rc.note("qa", `QA вызова ${call}: ${JSON.stringify(report.gate)}; blocking: ${report.issues.filter((x) => x.severity === "blocking").map((x) => x.code).join(", ") || "—"}`);
  return { report };
}
