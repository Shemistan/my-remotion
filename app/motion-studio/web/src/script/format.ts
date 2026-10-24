// Подписи сценария для человека (S8): секунды и длительность сцены из кадров (§5.2), время
// чтения текста, русские названия приёмов и форм времени, оценка пакета генерации, текст
// ошибок API с поправкой на сценарный смысл кода.
import { type Fps, type ReadingSettings, type SceneFrames, STRUCTURE_RULES, type ScriptSceneItem, TECHNIQUES, type Technique, readingFrames } from "@ms/contracts";
import { ApiError } from "../api/client.js";
import { errorText, t, tk, tn } from "../i18n/index.js";

const comma = (x: number) => String(x).replace(".", ",");

/** Секунды до 0,1 с с запятой: «6,4 с», «3 с». */
export function formatSeconds(frames: number, fps: Fps): string {
  const s = Math.round(((frames * fps.den) / fps.num) * 10) / 10;
  return t("scriptPlan.seconds", { s: comma(s) });
}

/** «речь 6,4 с + запас 1,5 с = 7,9 с»: запас — начало и конец вместе. */
export function formatDuration(f: SceneFrames, fps: Fps): string {
  return t("scriptPlan.duration", { speech: formatSeconds(f.speech, fps), pad: formatSeconds(f.lead + f.tail, fps), total: formatSeconds(f.total, fps) });
}

/** Минуты:секунды — «1:22». */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export const DEFAULT_FPS: Fps = { num: 30, den: 1 };

/**
 * «205 слов · 1:22» — число слов и время речи по той же формуле, что у сервера (`readingFrames`,
 * целые кадры, §5.2); секунды — вверх до целой.
 */
export function readingSummary(words: number, reading: ReadingSettings, fps: Fps): string {
  const frames = words > 0 ? readingFrames(words, reading, fps).speech : 0;
  const seconds = Math.ceil((frames * fps.den) / fps.num);
  return t("scriptPlan.reading.summary", { words: tn("scriptPlan.words", words), clock: formatClock(seconds) });
}

export const techniqueLabel = (x: Technique): string => tk(`scriptPlan.technique.${x}`, x);
export const techniqueHint = (x: Technique): string => tk(`scriptPlan.techniqueHint.${x}`, "");

/** Форма времени сцены: по `structure_rule`, без неё — типичная структура приёма. */
export function structureLabel(item: Pick<ScriptSceneItem, "technique" | "structure_rule">): string {
  const byRule = item.structure_rule ? STRUCTURE_RULES.find(([r]) => r === item.structure_rule)?.[1] : undefined;
  const s = byRule ?? TECHNIQUES.find((x) => x.slug === item.technique)?.structure;
  return s ? tk(`scriptPlan.structure.${s}`, "") : "";
}

// Справочная оценка пакета генерации (спека §8): сцены генерируются по очереди; по e2e
// Playground одна сцена — около 5 мин и $1,5 (Concept, Director, Engineer, рендер, QA).
const SCENE_MINUTES = 5;
const SCENE_USD = 1.5;

export function generateEstimate(n: number): { minutes: number; usd: string } {
  return { minutes: Math.max(1, Math.round(n * SCENE_MINUTES)), usd: comma(Math.round(n * SCENE_USD * 10) / 10) };
}

/** Текст ошибки API сценария: `plan_outdated` здесь — текст новее плана (не монтаж видео). */
export function scriptErrorText(e: unknown): string {
  if (e instanceof ApiError && e.code === "plan_outdated") return t("scriptPlan.error.plan_outdated");
  return errorText(e);
}
