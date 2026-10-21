// Воспроизводимость eval: чем сгенерирована сцена (хеши промптов) и чем она оценена
// (отпечаток судьи — хеш рубрики и якорей шкалы). Прогоны судьи с разными отпечатками не
// агрегируются и не сравниваются.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PROMPTS_DIR } from "../agents/prompts.js";
import { REFERENCE, type ReferenceGrade } from "./reference.js";

export const RUBRIC_FILE = "rubric-judge.md";

export function sha256(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/** sha256 всех `*.md` каталога промптов, включая вложенные (partials): путь → хеш. */
export function promptHashes(dir: string = PROMPTS_DIR): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (rel: string) => {
    for (const e of readdirSync(join(dir, rel), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && e.name.endsWith(".md")) out[p] = sha256(readFileSync(join(dir, p)));
    }
  };
  walk("");
  return out;
}

/** Отпечаток судьи: рубрика и якоря шкалы (оценки дизайнера с выжимками). */
export interface JudgeFingerprint {
  rubric_sha256: string;
  anchors_sha256: string;
}

/** Хеш якорей: id, оценка и текст; разбиение train/holdout в хеш не входит. */
export function anchorsHash(ref: readonly ReferenceGrade[]): string {
  return sha256(JSON.stringify(ref.map((r) => [r.id, r.grade, r.anchor])));
}

export function judgeFingerprint(dir: string = PROMPTS_DIR, ref: readonly ReferenceGrade[] = REFERENCE): JudgeFingerprint {
  return { rubric_sha256: sha256(readFileSync(join(dir, RUBRIC_FILE))), anchors_sha256: anchorsHash(ref) };
}

/**
 * Общий отпечаток набора прогонов судьи (`where` — для сообщения). Пусто — null; у
 * прогона нет хеша или отпечатки различаются — ошибка: такие оценки смешивать нельзя.
 */
export function sameFingerprint(items: readonly { where: string; fp: Partial<JudgeFingerprint> | undefined }[]): JudgeFingerprint | null {
  let first: { where: string; fp: JudgeFingerprint } | null = null;
  for (const { where, fp } of items) {
    if (!fp?.rubric_sha256 || !fp.anchors_sha256) throw new Error(`eval: у прогона судьи ${where} нет хеша рубрики или якорей — перезапусти судью с --rejudge`);
    const cur = { rubric_sha256: fp.rubric_sha256, anchors_sha256: fp.anchors_sha256 };
    if (!first) first = { where, fp: cur };
    else if (first.fp.rubric_sha256 !== cur.rubric_sha256 || first.fp.anchors_sha256 !== cur.anchors_sha256) {
      throw new Error(`eval: прогоны судьи с разными рубриками или якорями (${short(first.fp)} у ${first.where}, ${short(cur)} у ${where}) — агрегировать нельзя; перезапусти судью с --rejudge`);
    }
  }
  return first?.fp ?? null;
}

export const short = (fp: JudgeFingerprint) => `рубрика ${fp.rubric_sha256.slice(0, 8)} / якоря ${fp.anchors_sha256.slice(0, 8)}`;
