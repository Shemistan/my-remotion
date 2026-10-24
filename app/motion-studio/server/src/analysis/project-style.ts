// StyleBible проекта (Task 32, V6): пресет Phase 1 + правки палитры и шрифта, интенсивность,
// глубина. `resolved` — `resolveStyle` без полей рендера (амплитуда, глубина, прозрачность, fps).
// Контраст: blocking — по правилам Phase 1 (`qa/programmatic.ts`: text ≥ 4,5, muted ≥ 3 к фону),
// warning `style_contrast_low` — ниже плановых 7 / 4,5 (решение контроллера, уточнения Task 32).
// Ревизии — `style/<id>/r<N>/style.json`; новая ревизия делает валидный B `stale(style_changed)`,
// а правка пользователя при готовом плане ставит `plan.recheck` (перенос плана на новый стиль без LLM).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type PlanIssue, type ProjectStyleBase, type ProjectStyleDoc, ProjectStyleDocSchema, type StyleBible } from "@ms/contracts";
import { canonicalJson } from "@ms/contracts/canonical";
import { contrastRatio, resolveStyle } from "@ms/render";
import { cascadeStale } from "../approvals/engine.js";
import { artifactPaths } from "../artifacts/paths.js";
import type { Db } from "../db/open.js";
import * as plans from "../db/repos/plans.js";
import * as styles from "../db/repos/styles.js";
import { EditError, RevisionConflictError } from "../edit/errors.js";
import type { EditDeps } from "../edit/transcript-ops.js";
import { projectLockKey } from "../jobs/locks.js";
import { enqueue } from "../jobs/queue.js";
import { newId } from "../scenes/ids.js";
import type { Fence } from "../scenes/repo.js";

export const STYLE_FILE = "style.json";

/** Ключ идемпотентности перепроверки плана после новой ревизии стиля. */
export const planRecheckStyleKey = (styleId: string, revision: number): string => `plan.recheck:style:${styleId}@r${revision}`;

/** Пороги Phase 1 (`qa/programmatic.ts`) — ниже blocking. */
export const MIN_TEXT_CONTRAST = 4.5;
export const MIN_MUTED_CONTRAST = 3;
/** Пороги плана Task 32 (AAA для текста) — ниже warning. */
export const GOOD_TEXT_CONTRAST = 7;
export const GOOD_MUTED_CONTRAST = 4.5;

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function resolve(base: ProjectStyleBase, withOverrides: boolean): StyleBible {
  const r = resolveStyle({
    preset: base.preset, intensity: base.intensity, depth: base.depth as 0 | 1 | 2 | 3,
    ...(withOverrides && base.palette_overrides ? { palette_overrides: base.palette_overrides } : {}),
    ...(withOverrides && base.font !== undefined ? { font: base.font } : {}),
  });
  const bible: Partial<typeof r> = { ...r };
  for (const k of ["amplitude", "depth", "transparent", "fpsScale"] as const) delete bible[k];
  return bible as StyleBible;
}

/** Разрешённый стиль проекта и его проблемы (контраст, неверные правки). */
export function projectStyleFrom(base: ProjectStyleBase): { resolved: StyleBible; issues: PlanIssue[] } {
  const bad = Object.entries(base.palette_overrides ?? {}).filter(([, v]) => !HEX.test(v.trim()));
  if (bad.length > 0) {
    return {
      resolved: resolve(base, false),
      issues: [{ code: "style_invalid", severity: "blocking", message: `цвета палитры — только hex (#rrggbb): ${bad.map(([k, v]) => `${k}=${v}`).join(", ")}` }],
    };
  }
  let resolved: StyleBible;
  try {
    resolved = resolve(base, true);
  } catch (e) {
    return { resolved: resolve(base, false), issues: [{ code: "style_invalid", severity: "blocking", message: (e as Error).message }] };
  }
  const issues: PlanIssue[] = [];
  const p = resolved.palette;
  for (const [key, min, good] of [["text", MIN_TEXT_CONTRAST, GOOD_TEXT_CONTRAST], ["muted", MIN_MUTED_CONTRAST, GOOD_MUTED_CONTRAST]] as const) {
    let ratio: number;
    try {
      ratio = contrastRatio(p[key], p.bg);
    } catch (e) {
      issues.push({ code: "style_invalid", severity: "blocking", message: `контраст palette.${key} не посчитан: ${(e as Error).message}` });
      continue;
    }
    const msg = `контраст palette.${key} ${p[key]} к фону ${p.bg} — ${ratio.toFixed(2)}`;
    if (ratio < min) issues.push({ code: "style_contrast", severity: "blocking", message: `${msg} < ${min}` });
    else if (ratio < good) issues.push({ code: "style_contrast_low", severity: "warning", message: `${msg} < ${good} (читаемо, но слабо)` });
  }
  return { resolved, issues };
}

/** Контраст пар «текст — фон» и «приглушённый — фон» разрешённого стиля с порогами (UI, ответ 400). */
export function styleContrast(resolved: StyleBible): { key: "text" | "muted"; color: string; bg: string; ratio: number; min: number; good: number }[] {
  const p = resolved.palette;
  const pairs = [["text", MIN_TEXT_CONTRAST, GOOD_TEXT_CONTRAST], ["muted", MIN_MUTED_CONTRAST, GOOD_MUTED_CONTRAST]] as const;
  return pairs.flatMap(([key, min, good]) => {
    try {
      return [{ key, color: p[key], bg: p.bg, ratio: contrastRatio(p[key], p.bg), min, good }];
    } catch {
      return [];
    }
  });
}

/** Текущая ревизия стиля проекта (документ из хранилища) или `undefined`. */
export function currentProjectStyle(db: Db, root: string, projectId: string): ProjectStyleDoc | undefined {
  const row = styles.byProject(db, projectId);
  const rev = row?.current_revision == null ? undefined : styles.revision(db, row.id, row.current_revision);
  if (!rev) return undefined;
  return readStyle(root, rev.rel_path);
}

function readStyle(root: string, rel: string): ProjectStyleDoc {
  return ProjectStyleDocSchema.parse(JSON.parse(readFileSync(join(root, rel), "utf8")));
}

/**
 * Новая ревизия стиля проекта. `base_revision` задан и не текущий — `revision_conflict`; замок
 * `project:<p>:plan` у задачи — `resource_busy`; та же основа, автор и обоснование — `no_change`.
 * В транзакции публикации: `styles.create` (первая), `insertRevision`, `cascadeStale(…, "style")`;
 * правка пользователя (без `fence`) при готовом плане — `enqueue("plan.recheck")` с ключом стиля
 * (план задачи `plan.visual` ссылается на свой стиль сам).
 */
export async function saveProjectStyle(
  deps: EditDeps, projectId: string, base: ProjectStyleBase, author: ProjectStyleDoc["author"],
  opts: { rationale?: string; base_revision?: number; fence?: Fence } = {},
): Promise<ProjectStyleDoc> {
  const { db, store } = deps;
  const row = styles.byProject(db, projectId);
  const cur = row?.current_revision ?? null;
  const conflict = (d: Db): RevisionConflictError | undefined => {
    if (opts.base_revision === undefined) return undefined;
    const now = row ? styles.get(d, row.id)!.current_revision : null;
    return now === opts.base_revision ? undefined : new RevisionConflictError(`StyleBible проекта ${projectId}`, opts.base_revision, now);
  };
  const early = conflict(db);
  if (early) throw early;
  const prev = row && cur !== null ? readStyle(deps.root, styles.revision(db, row.id, cur)!.rel_path) : undefined;
  const rationale = opts.rationale ?? prev?.rationale ?? "";
  if (prev && canonicalJson(prev.base) === canonicalJson(base) && prev.author === author && prev.rationale === rationale) {
    throw new EditError("no_change", "стиль проекта не изменился — новая ревизия не создаётся");
  }
  const styleId = row?.id ?? newId("sty");
  const doc = ProjectStyleDocSchema.parse({
    schema_version: 1, style_id: styleId, revision: (cur ?? 0) + 1, base, resolved: projectStyleFrom(base).resolved, rationale, author,
  });
  const destRel = artifactPaths(deps.root, projectId).styleRev(styleId, doc.revision);
  const register = (d: Db, files: { sha256: string }[]) => {
    if (!row) styles.create(d, { id: styleId, project_id: projectId });
    styles.insertRevision(d, { doc, rel_path: `${destRel}/${STYLE_FILE}`, sha256: files[0]!.sha256 });
    cascadeStale(d, projectId, "style");
    if (!opts.fence && plans.byProject(d, projectId)?.current_revision != null) {
      enqueue(d, { type: "plan.recheck", projectId, input: { projectId }, idempotencyKey: planRecheckStyleKey(styleId, doc.revision) });
    }
  };
  const check = (d: Db) => {
    const c = conflict(d);
    if (c) return c;
    // гонка без base_revision: другая правка успела раньше — ревизия r<N> уже занята
    const now = row ? styles.get(d, row.id)!.current_revision : (styles.byProject(d, projectId)?.current_revision ?? null);
    return now === cur ? undefined : new RevisionConflictError(`StyleBible проекта ${projectId}`, cur ?? 0, now);
  };
  // задача (`plan.visual`) сама держит замок `plan` и публикует с fencing попытки
  if (opts.fence) await store.publishJobDoc(opts.fence, destRel, STYLE_FILE, doc, register, { check });
  else await store.writeRevision(destRel, STYLE_FILE, doc, register, { lockKey: projectLockKey(projectId, "plan"), check });
  return doc;
}
