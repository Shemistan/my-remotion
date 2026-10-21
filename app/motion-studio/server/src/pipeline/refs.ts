// Материалы KB для агентов: кандидаты для Motion Director, `knowledge-refs.json` версии
// и каталог `refs/` draft для Engineer (04-agent-workflows.md §2, §7). Фильтр «только
// визуальное» — в самом адаптере (`KnowledgeAdapter.search`, Task 17); кандидаты задачи —
// `kb-select.ts`.
import { copyFile, lstat, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { ComponentSelection, KnowledgeRef } from "@ms/contracts";
import { MOTION_KIT_DIR } from "@ms/render";
import type { KnowledgeAdapter } from "../knowledge/adapter.js";
import type { CapabilityView } from "../knowledge/types.js";

/** То, что пайплайну нужно от KB (в юнит-тестах — фейк). */
export type KnowledgeSource = Pick<KnowledgeAdapter, "search" | "getCapability" | "getVisualPatterns" | "copyRefs">;

/** Выдержки official skills (`remotion-markup`), которые получает Engineer. */
export const SKILL_FILES = ["SKILL.md", "timing.md", "timing-props.md", "sequencing.md", "local-fonts.md", "transitions.md"] as const;
const SKILL_DIR = "remotion-markup";

/** Каталог official skills относительно корня исходников KB. */
export const SKILLS_REL = "official_skills/skills/skills";

/** Поля кандидата, которые видит Director (04-agent-workflows.md §7). */
export function candidateBrief(v: CapabilityView) {
  return {
    id: v.id,
    name: v.name,
    kind: v.kind,
    visualizes: v.visualizes,
    use_when: v.use_when,
    remotion_compat: v.compatibility_status,
    adaptations: v.adaptations,
    license_class: v.license_class,
    patterns: v.patterns,
  };
}

/** 1–2 самых частых паттерна среди кандидатов (по порядку выдачи при равенстве). */
export function topPatterns(cands: CapabilityView[], n = 2): string[] {
  const count = new Map<string, number>();
  for (const c of cands) for (const p of c.patterns) count.set(p, (count.get(p) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([p]) => p);
}

export interface DroppedSelection {
  kb_id: string;
  reason: string;
}

/**
 * Выбор Director, сведённый к допустимому: только id из предложенных кандидатов и только
 * `permissive` (лицензию берём из KB, а не из ответа модели; `allowRestricted` — явное
 * разрешение пользователя); повторы id — один раз.
 * Отброшенное возвращается с причиной — пайплайн пишет предупреждение и `selection.json`.
 * Идёт до knowledge-refs.json, manifest и промпта Engineer.
 */
export function filterSelection(
  selection: ComponentSelection,
  candidates: CapabilityView[],
  kb: KnowledgeSource,
  allowRestricted = false,
): { selection: ComponentSelection; dropped: DroppedSelection[] } {
  const offered = new Map(candidates.map((c) => [c.id, c]));
  const items: ComponentSelection["items"] = [];
  const dropped: DroppedSelection[] = [];
  const seen = new Set<string>();
  for (const item of selection.items) {
    if (seen.has(item.kb_id)) continue;
    seen.add(item.kb_id);
    if (!offered.has(item.kb_id)) {
      dropped.push({ kb_id: item.kb_id, reason: "нет среди предложенных кандидатов" });
      continue;
    }
    const license = (kb.getCapability(item.kb_id) ?? offered.get(item.kb_id))!.license_class;
    if (license !== "permissive" && !allowRestricted) {
      dropped.push({ kb_id: item.kb_id, reason: `license_class ${license}, допустим только permissive` });
      continue;
    }
    items.push(item);
  }
  return { selection: { items }, dropped };
}

/**
 * Записи `knowledge-refs.json` по выбору Director: только известные KB id, по одной на id.
 * Неизвестные id возвращаются отдельно (предупреждение, не ошибка).
 */
export function knowledgeRefs(selection: ComponentSelection, kb: KnowledgeSource): { refs: KnowledgeRef[]; unknown: string[] } {
  const refs: KnowledgeRef[] = [];
  const unknown: string[] = [];
  const seen = new Set<string>();
  for (const item of selection.items) {
    if (seen.has(item.kb_id)) continue;
    seen.add(item.kb_id);
    const v = kb.getCapability(item.kb_id);
    if (!v) {
      unknown.push(item.kb_id);
      continue;
    }
    refs.push({
      kb_id: v.id,
      repository: v.repository,
      repository_url: v.repository_url,
      commit: v.commit,
      license: v.license,
      license_class: v.license_class,
      strategy: item.strategy,
      source_paths: v.source_paths,
    });
  }
  return { refs, unknown };
}

/** mkdir одного уровня внутри существующего каталога: пропавший родитель не воссоздаётся. */
async function mkdirIn(parent: string, name: string): Promise<string> {
  const dir = join(parent, name);
  try {
    await mkdir(dir);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
  }
  const st = await lstat(dir);
  if (!st.isDirectory() || st.isSymbolicLink()) throw new Error(`refs: ${dir} — не каталог`);
  return dir;
}

/**
 * Готовит `refs/` в draft: `refs/kb/<id>/…` + `CARD.md` выбранных записей (только permissive;
 * прочие и неизвестные id пропускаются), `refs/motion-kit/API.md`,
 * `refs/skills/remotion-markup/*.md` из `skillsRoot`. Нет файла skills — ошибка.
 */
export async function prepareRefs(draftDir: string, selection: ComponentSelection, kb: KnowledgeSource, skillsRoot: string): Promise<void> {
  const st = await lstat(draftDir);
  if (!st.isDirectory()) throw new Error(`refs: draft не каталог: ${draftDir}`);
  const refs = await mkdirIn(draftDir, "refs");

  const ids = [...new Set(selection.items.map((i) => i.kb_id))].filter((id) => kb.getCapability(id)?.license_class === "permissive");
  const kbDir = await mkdirIn(refs, "kb");
  if (ids.length > 0) await kb.copyRefs(ids, kbDir);

  const kitDir = await mkdirIn(refs, "motion-kit");
  await copyFile(join(MOTION_KIT_DIR, "API.md"), join(kitDir, "API.md"));

  const skillsDir = await mkdirIn(await mkdirIn(refs, "skills"), SKILL_DIR);
  for (const f of SKILL_FILES) await copyFile(join(skillsRoot, SKILL_DIR, f), join(skillsDir, f));
}
