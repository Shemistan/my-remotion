// QA сцены сценария по всей сцене и по герою (S15b): временной проход пробы (kit 0.5.8) и
// энергия движения превью → temporalIssues; кандидаты героя на пике payoff и в удержании →
// heroIssues. Зовётся из fix-loop (runQa) только для сцен сценария.
import type { MotionSpec, QAIssue, Settings } from "@ms/contracts";
import { type FfmpegOptions, SWEEP_EVERY, gridDims, previewLuma, resolveStyle } from "@ms/render";
import { HERO_BLOCKING, type HeroFrame, type LayoutFrame, heroIssues } from "../qa/layout.js";
import type { KeyMoment } from "../qa/spec-checks.js";
import { type Motion, type Window, parseSweep, temporalIssues } from "../qa/temporal.js";

/** Пик payoff: начало фазы payoff + столько кадров (удар уже читается). */
export const PAYOFF_PEAK = 10;

export interface ScriptSceneQaInput {
  spec: MotionSpec;
  settings: Settings;
  browserLogs: readonly string[];
  layout: readonly LayoutFrame[];
  previewPath?: string;
  /** Окно речи; без него проверок по времени нет (только герой). */
  window?: Window;
  moments?: readonly KeyMoment[];
  technique?: string;
  /** props.json попытки (метр стороны split-versus). */
  propsText?: string;
  ffmpeg?: FfmpegOptions;
  /** Подмена яркости превью (тесты). */
  luma?: (preview: string, o: { every: number; w: number; h: number } & FfmpegOptions) => Promise<Motion>;
}

/** Начало фазы payoff (первый бит её фаз); нет фазы — undefined. */
export function payoffStart(spec: MotionSpec): number | undefined {
  const ids = new Set((spec.phases ?? []).filter((p) => p.role === "payoff").map((p) => p.id));
  const starts = spec.beats.filter((b) => b.phase !== undefined && ids.has(b.phase)).map((b) => b.start_frame);
  return starts.length > 0 ? Math.min(...starts) : undefined;
}

/**
 * Замечания сцены сценария по всей сцене и по герою + строки журнала (что посчитано и чего не
 * хватило). Сбой яркости превью — без `dead_air` (движение не видно), не ошибка попытки.
 */
export async function scriptSceneIssues(i: ScriptSceneQaInput): Promise<{ issues: QAIssue[]; notes: string[] }> {
  const notes: string[] = [];
  const sweep = parseSweep(i.browserLogs);
  const out: Omit<QAIssue, "source">[] = [];
  if (sweep.length < 2) notes.push(`временной проход: ${sweep.length} кадров пробы — проверки по всей сцене пропущены`);
  else if (i.window) {
    let motion: Motion | undefined;
    if (i.previewPath) {
      const { gw, gh } = gridDims({ w: i.settings.width, h: i.settings.height });
      try {
        motion = await (i.luma ?? previewLuma)(i.previewPath, { every: SWEEP_EVERY, w: gw, h: gh, ...i.ffmpeg });
      } catch (e) {
        notes.push(`энергия движения превью не посчитана (dead_air пропущен): ${(e as Error).message.slice(0, 300)}`);
      }
    }
    const enter = resolveStyle({ preset: i.spec.style_preset, intensity: i.settings.animation_intensity, fps: i.spec.fps }).motion.enter_frames;
    out.push(...temporalIssues(sweep, i.spec, i.window, motion, { enter, ...(i.moments ? { moments: i.moments } : {}) }));
    notes.push(`временной проход: ${sweep.length} кадров пробы (${sweep[0]!.frame}–${sweep.at(-1)!.frame}), энергия ${motion ? `${motion.luma.length} сэмплов` : "нет"}`);
  }
  const at = payoffStart(i.spec);
  const peakAt = at === undefined ? undefined : at + PAYOFF_PEAK;
  const near = peakAt === undefined ? undefined : sweep.reduce<(typeof sweep)[number] | undefined>((a, f) => (!a || Math.abs(f.frame - peakAt) < Math.abs(a.frame - peakAt) ? f : a), undefined);
  const peak: HeroFrame | undefined = near ? { frame: near.frame, heroes: near.heroes, areas: near.areas } : undefined;
  const last = i.layout.reduce<LayoutFrame | undefined>((a, f) => (!a || f.frame > a.frame ? f : a), undefined);
  const hold: HeroFrame | undefined = last ? { frame: last.frame, heroes: last.heroes ?? [], ...(last.areas ? { areas: last.areas } : {}) } : undefined;
  out.push(...heroIssues({ ...(peak ? { peak } : {}), ...(hold ? { hold } : {}), ...(i.technique ? { technique: i.technique } : {}), metric: /"metric"\s*:/.test(i.propsText ?? ""), blocking: HERO_BLOCKING }));
  return { issues: out.map((x) => ({ source: "programmatic" as const, ...x })), notes };
}
