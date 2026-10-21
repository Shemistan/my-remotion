// Visual QA (04 §1, 06 §6): агент читает реальные кадры. Его cwd — отдельный каталог
// `run/tmp/<runId>-a<attempt>/qa` с копиями кадров и данными проверки: исходников сцены
// там нет, а `--restricted` не даёт Read выйти за cwd. Каталог вне draft, чтобы копии
// не попали в опубликованную версию.
import { copyFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type MotionSpec, type VisualQAOutput, VisualQAOutputSchema } from "@ms/contracts";
import { safeMkdir } from "@ms/core";
import type { ResolvedStyle } from "@ms/render";
import type { AgentResult, AgentRuntimeAdapter, AgentTask } from "../agents/runtime.js";
import type { AppConfig } from "../config.js";
import { inBeat, uncoveredElements } from "../pipeline/qa-frames.js";

export interface VisualQAInput {
  /** draft-каталог версии: кадры берутся из `<workdir>/frames/<n>.png`. */
  workdir: string;
  frames: number[];
  spec: MotionSpec;
  style: ResolvedStyle;
  /** brief.json сцены (запрос и настройки) — для семантического gate. */
  brief: unknown;
  runRef: { root: string; runId: string; attempt: number };
  signal: AbortSignal;
}

export interface VisualQADeps {
  agents: AgentRuntimeAdapter;
  config: AppConfig;
  /** Журнал пайплайна: id из ответа агента, которых нет в spec. */
  log?: (message: string) => void;
}

/** Результат вызова и его время по часам (мс между startedAt и finishedAt рантайма). */
export type VisualQAResult = AgentResult<VisualQAOutput> & { wallMs: number };

const json = (v: unknown) => JSON.stringify(v, null, 2) + "\n";

/**
 * Камера сцены для brief.json Visual QA: ключи spec (`frame`, `scale`, `x`, `y`). Наезд или
 * сдвиг камеры двигает весь кадр между QA-кадрами — без ключей агент принимает зум за
 * «скачок раскладки».
 */
export function cameraBrief(spec: MotionSpec): { keys: NonNullable<MotionSpec["camera"]>; note: string } {
  const keys = spec.camera ?? [];
  return {
    keys,
    note: keys.length > 0
      ? "Ключи камеры: между ними весь кадр плавно масштабируется (scale) и сдвигается (x, y, px от центра). Общий сдвиг и рост всех элементов между кадрами — движение камеры, не скачок раскладки."
      : "Камера не движется: общий сдвиг или масштаб кадра между кадрами — брак.",
  };
}

/** Чек-лист вызова: кадры и элементы спецификации, которые агент обязан найти. */
export function qaChecklist(frames: number[], spec: MotionSpec): string {
  const beatsOf = (id: string) => spec.beats.filter((b) => b.element_ids.includes(id)).map((b) => `${b.id} [${b.start_frame}–${b.end_frame})`);
  const uncovered = new Set(uncoveredElements(spec, frames));
  return [
    "# Чек-лист Visual QA",
    "",
    "## Кадры",
    ...frames.map((f) => {
      const beats = spec.beats.filter((b) => inBeat(b, f, spec.duration_frames)).map((b) => `${b.id} (${b.action})`);
      return `- \`frames/${f}.png\` — кадр ${f}${beats.length > 0 ? `, биты: ${beats.join(", ")}` : ", вне битов"}`;
    }),
    "",
    "## Элементы spec — каждый в `elements_seen`",
    "Для каждого `id` найди элемент хотя бы на одном кадре, где он должен быть виден (по битам).",
    "Не нашёл ни на одном кадре — `seen: false`. При `seen: true` обязателен `frame` — кадр из",
    "списка, где элемент виден лучше всего (и он должен быть в `checked_frames`).",
    "Пометка «нет кадра в битах» — ни один кадр не попал в биты элемента: ищи его, но если он",
    "по замыслу уже исчез или ещё не появился, `seen: false` здесь не брак.",
    "",
    ...spec.elements.map(
      (e) => `- \`${e.id}\` — ${e.kind}, роль «${e.role}», вход ${e.entrance}; биты: ${beatsOf(e.id).join(", ") || "—"}${uncovered.has(e.id) ? " — нет кадра в битах" : ""}`,
    ),
    "",
    "## Проверить",
    "- одна мысль и иерархия: главный элемент крупнее и заметнее остальных;",
    "- обрезка и safe area, перекрытия текста и узлов;",
    "- контраст и размер текста;",
    "- разные входы у разных элементов, ритм битов по кадрам;",
    "- смысл запроса (`brief.json`) и стиль (`style.json`);",
    ...(spec.camera && spec.camera.length > 0
      ? [`- камера (\`brief.json\` → \`camera\`): ключи ${spec.camera.map((k) => `${k.frame}: ×${k.scale}`).join(", ")} — общий масштаб и сдвиг кадра по ним не скачок раскладки;`]
      : []),
    "- каждое число и подпись на кадре — в `ocr` этого кадра дословно.",
    "",
  ].join("\n");
}

function prompt(frames: number[]): string {
  return [
    "Проверь сцену по реальным кадрам. Все файлы — в текущем каталоге:",
    "- `checklist.md` — что проверить и какие элементы найти (прочитай первым);",
    "- `spec.json` — спецификация сцены, `style.json` — стиль, `brief.json` — запрос пользователя;",
    `- кадры: ${frames.map((f) => `\`frames/${f}.png\``).join(", ")}.`,
    "Открой инструментом Read каждый кадр. Оценивай только то, что видно на кадрах.",
  ].join("\n");
}

export async function runVisualQA(input: VisualQAInput, deps: VisualQADeps): Promise<VisualQAResult> {
  const { root, runId, attempt } = input.runRef;
  const frames = [...new Set(input.frames)].sort((a, b) => a - b);
  const dir = await safeMkdir(root, join("run", "tmp", `${runId}-a${attempt}`, "qa"));
  // повторный QA в той же попытке (после исправления) видит только свои кадры
  await rm(join(dir, "frames"), { recursive: true, force: true });
  const framesDir = await safeMkdir(root, join("run", "tmp", `${runId}-a${attempt}`, "qa", "frames"));
  for (const f of frames) await copyFile(join(input.workdir, "frames", `${f}.png`), join(framesDir, `${f}.png`));
  await writeFile(join(dir, "spec.json"), json(input.spec));
  await writeFile(join(dir, "style.json"), json(input.style));
  await writeFile(join(dir, "brief.json"), json(input.brief));
  await writeFile(join(dir, "checklist.md"), qaChecklist(frames, input.spec));

  const s = deps.config.agents.visual_qa;
  const task: AgentTask<string> = {
    role: "visual_qa",
    input: prompt(frames),
    inputRefs: frames.map((f) => ({ kind: "file", id: `frames/${f}.png`, path: join(framesDir, `${f}.png`) })),
    workdir: dir,
    tools: ["Read"],
    model: s.model,
    limits: { timeoutMs: s.timeoutMs, maxBudgetUsd: s.maxBudgetUsd },
    idempotencyKey: `${runId}-a${attempt}-visual_qa-${frames.join("_")}`,
    run: input.runRef,
  };
  const r = await deps.agents.run(task, VisualQAOutputSchema, input.signal);
  const wallMs = Math.max(0, Date.parse(r.finishedAt) - Date.parse(r.startedAt)) || 0;
  if (!r.output) return { ...r, wallMs };
  const known = new Set(input.spec.elements.map((e) => e.id));
  const unknown = [...new Set(r.output.elements_seen.map((e) => e.id).filter((id) => !known.has(id)))];
  if (unknown.length > 0) deps.log?.(`Visual QA: elements_seen с id не из spec: ${unknown.join(", ")}`);
  return { ...r, wallMs, output: withMissing(r.output, input.spec, frames) };
}

/**
 * Элементы spec, которых агент не подтвердил:
 * - `seen: false` — blocking `missing_element` (visual → fail); но если ни один QA-кадр не
 *   попал в биты элемента, отсутствие на кадрах ничего не доказывает — warning;
 * - `seen: true` без `frame` из `checked_frames`, или элемент не упомянут — warning
 *   (не подтверждён; visual не лучше warn).
 * Дубли id в `elements_seen`: худший ответ (`seen: false`) побеждает.
 */
function withMissing(out: VisualQAOutput, spec: MotionSpec, frames: number[]): VisualQAOutput {
  const seen = new Map<string, VisualQAOutput["elements_seen"][number]>();
  for (const e of out.elements_seen) {
    const prev = seen.get(e.id);
    if (!prev || (prev.seen && !e.seen)) seen.set(e.id, e);
  }
  const checked = new Set(out.checked_frames);
  const uncovered = new Set(uncoveredElements(spec, frames));
  const issues = [...out.issues];
  let visual = out.gate.visual;
  const warn = () => {
    if (visual === "pass" || visual === "not_checked") visual = "warn";
  };
  for (const e of spec.elements) {
    const s = seen.get(e.id);
    const beats = spec.beats.filter((b) => b.element_ids.includes(e.id)).map((b) => b.id).join(", ") || "spec";
    if (s?.seen === false && !uncovered.has(e.id)) {
      issues.push({
        code: "missing_element", severity: "blocking", area: e.id,
        description: `элемент ${e.id} (${e.kind}, «${e.role}») не найден ни на одном QA-кадре внутри его битов`,
        fix_hint: `построй ${e.id} в сцене и покажи его в битах ${beats}`,
      });
      visual = "fail";
    } else if (s?.seen === false) {
      issues.push({
        code: "missing_element", severity: "warning", area: e.id,
        description: `элемент ${e.id} не найден, но ни один QA-кадр не попал в его биты — не проверен`,
        fix_hint: `проверь, что ${e.id} виден в битах ${beats}`,
      });
      warn();
    } else if (s === undefined || s.frame === undefined || !checked.has(s.frame)) {
      issues.push({
        code: "missing_element", severity: "warning", area: e.id,
        description: s === undefined
          ? `Visual QA не подтвердил элемент ${e.id}: его нет в elements_seen`
          : `Visual QA не подтвердил элемент ${e.id}: seen без кадра из checked_frames (frame ${s.frame ?? "—"})`,
        fix_hint: `проверь, что ${e.id} виден на кадрах своих битов`,
      });
      warn();
    }
  }
  return { ...out, issues, gate: { ...out.gate, visual } };
}
