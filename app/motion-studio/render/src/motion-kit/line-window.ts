// Окно прорисовки линии LineChart внутри бита — чистый расчёт без React: им пользуются
// LineChart / lineChartHead и сервер (привязка бита счётчика к голове линии).
import type { Beat } from "@ms/contracts";

/**
 * Окно прорисовки линии: 12–80 % бита. `drawStart` — целый кадр (в нём голова ещё на первой
 * точке), `drawEnd` — дробный конец; `startFrame` / `endFrame` — то же, что отдаёт
 * `lineChartHead`: последний кадр на первой точке и кадр, когда линия дорисована.
 */
export function lineDrawWindow(beat: Pick<Beat, "start_frame" | "end_frame">): { drawStart: number; drawEnd: number; startFrame: number; endFrame: number } {
  const L = Math.max(1, beat.end_frame - beat.start_frame);
  const drawStart = beat.start_frame + Math.ceil(L * 0.12);
  const drawEnd = beat.start_frame + L * 0.8;
  return { drawStart, drawEnd, startFrame: drawStart, endFrame: Math.ceil(drawEnd) };
}
