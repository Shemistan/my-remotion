// Типы композиции таймлайна (Task 36). Только типы: ProjectTimeline.tsx берёт их `import type`,
// в бандл Remotion они не попадают.
import type { Fps, SequenceSpec } from "@ms/contracts";

/** Сцена на таймлайне: модуль `key` реестра entry, props версии, окно в кадрах ролика. */
export interface TimelineSceneSpec {
  clip_id: string;
  /** Ключ модуля в реестре entry (`writeTimelineEntry`). */
  key: string;
  /** Props версии; у прозрачной — уже `overlayInputProps` (`renderTimelineRange`). */
  props: Record<string, unknown>;
  start_frame: number;
  duration_frames: number;
  /** Р-V5: `fullscreen` — false, остальные режимы — true (холст на весь кадр без фона). */
  transparent: boolean;
  /** Порядок слоёв: больше — выше; при равных — по началу. */
  z: number;
}

/** inputProps композиции `ProjectTimeline`. */
export interface TimelineRenderProps {
  width: number;
  height: number;
  fps: Fps;
  duration_frames: number;
  /** Видео исходника (master по URL медиасервера) кусками EDL — `clipsToSequences`. */
  video: { src: string; sequences: SequenceSpec[] };
  /** Смонтированная дорожка звука (`edited-audio.wav` по URL медиасервера). */
  audio?: { src: string };
  scenes: TimelineSceneSpec[];
}
