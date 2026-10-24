// Слияние анализа видеоряда (Task 30): детектор Vision (лицо, руки, люди — основа безопасных
// зон) + наблюдения Footage Analyst (объекты, жесты, фон, движение камеры). Агент может только
// ДОБАВИТЬ занятые области (важные объекты); лицо и рамки детектора он не убирает и не
// двигает. Позиция автора — по детектору; несогласие агента — пометка, а не замена. Время агент
// не выдаёт: объект ссылается на кадр из отправленного списка (`frame_us`), другой — отброшен.
import type { FootageAgentOutput, FootageShot, NormRect } from "@ms/contracts";
import { MIN_SHOT_KEYFRAMES } from "./keyframes.js";
import type { VisionFrame } from "./vision.js";
import { DEFAULT_ZONES, OCCUPIED_DEFAULTS, type OccupiedOptions, bboxOf, clipRect, freeZones, occupiedRegions } from "./zones.js";

export interface ShotInput {
  id: string;
  start_us: number;
  end_us: number;
  /** Ключевые кадры шота: момент и путь PNG относительно каталога анализа. */
  keyframes: { us: number; path: string }[];
}

export interface MergeOptions extends Partial<OccupiedOptions> {
  /** Кадры, отправленные агенту по шотам (по умолчанию — все ключевые кадры шота). */
  sentUs?: Record<string, readonly number[]>;
}

type AgentShot = FootageAgentOutput["shots"][number];
type Position = FootageShot["author_position"];

export const U_DISAGREE = "расхождение детектора и агента";
export const U_FEW_FRAMES = "мало кадров";
export const U_NO_FRAMES = "нет кадров";
export const U_BAD_FRAME = "агент указал кадр не из списка";
export const U_NO_MOTION = "движение камеры не оценено";
export const U_LLM_ONLY = "низкая уверенность зон: нет детектора Vision";
export const U_NO_DATA = "нет данных о кадре: ни детектора, ни агента";
export const U_AGENT_MISSING = "агент не описал шот";
export const U_HUGE_OBJECT = "агент отметил важным объект больше 60 % кадра";
export const U_VISION_FRAME_ERROR = "детектор не прочитал кадр";

/** Важный объект агента больше этой доли кадра — пометка (подозрительно: закроет все зоны). */
export const HUGE_OBJECT_AREA = 0.6;

function positionOf(cx: number): "left" | "center" | "right" {
  return cx < 0.4 ? "left" : cx > 0.6 ? "right" : "center";
}

/**
 * Позиция автора по детектору: центр самого крупного лица кадра; разные стороны с разбросом
 * центров > 0,3 — `mixed`; лиц нет — по рамке человека, иначе `absent`.
 */
export function authorPositionFromVision(frames: readonly VisionFrame[]): Position {
  const centers: number[] = [];
  for (const f of frames) {
    const pool = f.faces.length > 0 ? f.faces : [];
    const big = [...pool].sort((a, b) => b.w * b.h - a.w * a.h)[0];
    if (big) centers.push(big.x + big.w / 2);
  }
  if (centers.length === 0) {
    const bodies = frames.flatMap((f) => f.humans);
    if (bodies.length === 0) return "absent";
    const b = bboxOf(bodies)!;
    return positionOf(b.x + b.w / 2);
  }
  const kinds = new Set(centers.map(positionOf));
  if (kinds.size > 1 && Math.max(...centers) - Math.min(...centers) > 0.3) return "mixed";
  return positionOf(centers.reduce((a, b) => a + b, 0) / centers.length);
}

function sameRect(a: NormRect, b: NormRect): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

/** Псевдокадр детектора из объектов агента одного кадра (llm_only): лица и руки, рамки сверху слева. */
function agentFrame(us: number, objs: AgentShot["objects"]): VisionFrame {
  const boxes = (kind: "face" | "hands") => objs.filter((x) => x.kind === kind && x.rect).map((x) => ({ ...x.rect!, confidence: 0.5 }));
  return { path: `agent:${us}`, width: 0, height: 0, faces: boxes("face"), humans: [], hands: boxes("hands"), saliency: [] };
}

/**
 * Шоты анализа: `vision` — кадры детектора по id шота в порядке ключевых кадров (`undefined` —
 * режим `llm_only`); `agent` — ответ Footage Analyst (нет — без наблюдений).
 */
export function mergeFootage(shots: readonly ShotInput[], vision: Record<string, readonly VisionFrame[]> | undefined, agent?: FootageAgentOutput, o: MergeOptions = {}): FootageShot[] {
  const occ: OccupiedOptions = { ...OCCUPIED_DEFAULTS, ...Object.fromEntries(Object.entries(o).filter(([k, v]) => k !== "sentUs" && v !== undefined)) };
  const byId = new Map<string, AgentShot>();
  for (const s of agent?.shots ?? []) if (!byId.has(s.shot_id)) byId.set(s.shot_id, s);

  return shots.map((shot) => {
    const uncertainty: string[] = [];
    const notes: string[] = [];
    const add = (u: string) => {
      if (!uncertainty.includes(u)) uncertainty.push(u);
    };
    const n = shot.keyframes.length;
    if (n === 0) add(U_NO_FRAMES);
    else if (n < MIN_SHOT_KEYFRAMES) add(U_FEW_FRAMES);

    // кадры, которые детектор не прочитал (m7), — не «кадр без лица»: из расчёта долей исключены
    const all = vision ? (vision[shot.id] ?? []) : undefined;
    const frames = all?.filter((f) => f.error === undefined);
    if (all && frames && frames.length < all.length) add(U_VISION_FRAME_ERROR);

    const a = byId.get(shot.id);
    if (agent && !a && n > 0) add(U_AGENT_MISSING);
    const sentList = o.sentUs?.[shot.id] ?? shot.keyframes.map((k) => k.us);
    const sent = new Set(sentList);
    const objects: AgentShot["objects"] = [];
    for (const obj of a?.objects ?? []) {
      if (!sent.has(obj.frame_us)) {
        add(U_BAD_FRAME);
        continue;
      }
      objects.push(obj);
    }

    // llm_only (I1): лицо и руки — объекты агента вида face/hands, разложенные по отправленным
    // кадрам как кадры детектора: те же поля (faceMargin, handMargin), охватывающая рамка, доля
    // кадров и пометка «лицо найдено менее чем на 30 % кадров»; занятость — независимо от important
    const body = (x: AgentShot["objects"][number]) => !frames && (x.kind === "face" || x.kind === "hands");
    const pseudo = frames ? undefined : sentList.map((us) => agentFrame(us, objects.filter((x) => x.frame_us === us)));
    const detFrames = frames ?? pseudo!;
    const regions = n > 0 && (frames || a) ? occupiedRegions(detFrames, occ) : undefined;
    for (const u of regions?.uncertain ?? []) add(u);

    // занятое: детектор (или лицо/руки агента в llm_only) ∪ важные объекты агента (только добавление)
    const occupied: NormRect[] = [...(regions?.occupied ?? [])];
    for (const obj of objects) {
      if (body(obj) || !obj.important || !obj.rect) continue;
      const r = clipRect(obj.rect);
      if (!r) continue;
      if (r.w * r.h > HUGE_OBJECT_AREA) add(U_HUGE_OBJECT);
      if (!occupied.some((x) => sameRect(x, r))) occupied.push(r);
    }

    let face: FootageShot["face"];
    let author: Position;
    if (frames) {
      face = { ...(regions?.face ? { union: regions.face } : {}), detected_ratio: regions?.faceRatio ?? 0, source: "vision" };
      author = authorPositionFromVision(frames);
      if (a && n > 0 && (regions?.faceRatio ?? 0) > 0 && a.author_position !== author) {
        add(U_DISAGREE);
        notes.push(`Позиция автора: детектор: ${author}, агент: ${a.author_position}.`);
      }
    } else {
      // llm_only: лицо — только из объектов агента (уже расширено полем), уверенность низкая
      face = { ...(regions?.face ? { union: regions.face } : {}), detected_ratio: regions?.faceRatio ?? 0, source: "llm" };
      author = a?.author_position ?? "absent";
      add(U_LLM_ONLY);
      if (!a) add(U_NO_DATA);
    }

    if (!a) add(U_NO_MOTION);
    if (a) {
      if (a.notes.trim()) notes.unshift(a.notes.trim());
      if (a.background.trim()) notes.push(`Фон: ${a.background.trim()}`);
      notes.push(`Жесты: ${a.gestures}.`);
      for (const u of a.uncertainty) if (u.trim()) add(u.trim());
    }

    const known = n > 0 && (frames !== undefined || a !== undefined);
    const hands: FootageShot["hands"] = { ...(regions?.hands ? { union: regions.hands } : {}), detected_ratio: regions?.handsRatio ?? 0 };
    return {
      id: shot.id,
      source_start_us: shot.start_us,
      source_end_us: shot.end_us,
      keyframes: shot.keyframes.map((k) => ({ us: k.us, path: k.path })),
      face,
      hands,
      occupied,
      free_zones: known ? freeZones(occupied, DEFAULT_ZONES) : [],
      author_position: author,
      motion: a?.motion ?? "static",
      objects: objects.map((x) => ({ label: x.label, ...(x.rect ? { rect: x.rect } : {}), important: x.important })),
      notes: notes.join(" "),
      uncertainty,
    };
  });
}
