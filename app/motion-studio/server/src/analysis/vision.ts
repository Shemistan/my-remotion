// Детектор Apple Vision (Task 30): утилита `tools/vision-detect` (Swift) — лица, люди, руки
// (рамка по суставам), салиентность на PNG-кадрах. Аргументы — только пути кадров из draft
// задачи (не от пользователя); утилита их только читает, сети не нужно; вывод — JSON на stdout.
// Запуск — через spawnTracked (своя группа, реестр попытки, SIGTERM → SIGKILL) с таймаутом.
// Координаты Vision — начало слева СНИЗУ; `parseVisionOutput` переводит в начало слева сверху.
import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NormRect } from "@ms/contracts";
import { spawnTracked } from "@ms/core";
import { z } from "zod";
import type { RunRef } from "../media/ffmpeg.js";
import { clipRect, r6 } from "./zones.js";

/** Собранный бинарник (`npm run build:vision`); в git не хранится. */
export const DEFAULT_VISION_BIN = fileURLToPath(new URL("../../../tools/vision-detect/bin/vision-detect", import.meta.url));

/** Рамка детектора в долях кадра (сверху слева) с уверенностью Vision. */
export type Detection = NormRect & { confidence: number };

/** Кадр после `parseVisionOutput`: координаты сверху слева, рамки внутри кадра. */
export interface VisionFrame {
  path: string;
  width: number;
  height: number;
  faces: Detection[];
  humans: Detection[];
  hands: Detection[];
  saliency: Detection[];
  /** Кадр не прочитан (не изображение, Vision отказал): детекций нет, это не «кадр без лица». */
  error?: string;
}

const Num = z.number().finite();
const RawBox = z.object({ x: Num, y: Num, w: Num, h: Num, confidence: Num }).strict();
const RawFrame = z.object({
  path: z.string().min(1),
  width: z.number().int().nonnegative(),
  height: z.number().int().nonnegative(),
  faces: z.array(RawBox),
  humans: z.array(RawBox),
  hands: z.array(RawBox),
  saliency: z.array(RawBox),
  /** Сбой одного кадра (m7): утилита не падает целиком, а отдаёт пустой кадр с причиной. */
  error: z.string().min(1).optional(),
}).strict().refine((f) => f.error !== undefined || (f.width > 0 && f.height > 0), { message: "размер кадра без error должен быть > 0" });
const RawOutput = z.array(RawFrame);

/** Vision (начало снизу слева) → наше (сверху слева): `y' = 1 − y − h`. */
export function fromVisionRect(r: NormRect): NormRect {
  return { x: r.x, y: r6(1 - r.y - r.h), w: r.w, h: r.h };
}

function toDetections(boxes: z.infer<typeof RawBox>[]): Detection[] {
  const out: Detection[] = [];
  for (const b of boxes) {
    if (!(b.w > 0 && b.h > 0)) continue;
    const r = clipRect(fromVisionRect(b));
    if (r) out.push({ ...r, confidence: r6(Math.min(1, Math.max(0, b.confidence))) });
  }
  return out;
}

/** Вывод `vision-detect` (Zod) → кадры в наших координатах; не та форма — исключение. */
export function parseVisionOutput(json: unknown): VisionFrame[] {
  return RawOutput.parse(json).map((f) => (f.error !== undefined
    ? { path: f.path, width: f.width, height: f.height, faces: [], humans: [], hands: [], saliency: [], error: f.error.slice(0, 500) }
    : {
      path: f.path, width: f.width, height: f.height,
      faces: toDetections(f.faces), humans: toDetections(f.humans), hands: toDetections(f.hands), saliency: toDetections(f.saliency),
    }));
}

/** Бинарник есть и исполняемый (иначе анализ — `llm_only`). */
export async function visionAvailable(bin: string = DEFAULT_VISION_BIN): Promise<boolean> {
  try {
    if (!(await stat(bin)).isFile()) return false;
    await access(bin, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export class VisionError extends Error {
  constructor(readonly kind: "failed" | "timeout" | "aborted" | "orphaned", message: string) {
    super(message);
  }
}

export interface VisionRunOptions {
  run: RunRef;
  signal: AbortSignal;
  /** Кадров на один запуск (по умолчанию 40). */
  chunk?: number;
  /** Таймаут запуска, мс (по умолчанию 30 с + 2 с на кадр). */
  timeoutMs?: number;
  spawn?: typeof spawnTracked;
}

/**
 * `vision-detect` порциями по `chunk` кадров. Порядок и пути вывода сверяются с переданными
 * (чужой путь — ошибка). Код ≠ 0, мусор вместо JSON — `VisionError("failed")`; таймаут,
 * отмена, группа не исчезла (`orphaned`, rulings п. 13) — своим видом.
 */
export async function runVisionDetect(bin: string, pngs: readonly string[], o: VisionRunOptions): Promise<VisionFrame[]> {
  const chunk = Math.max(1, o.chunk ?? 40);
  const out: VisionFrame[] = [];
  for (let i = 0; i < pngs.length; i += chunk) {
    const part = pngs.slice(i, i + chunk);
    out.push(...(await runOnce(bin, part, o)));
  }
  return out;
}

async function runOnce(bin: string, pngs: string[], o: VisionRunOptions): Promise<VisionFrame[]> {
  if (o.signal.aborted) throw new VisionError("aborted", "vision-detect: отменено до запуска");
  if (pngs.some((p) => p.startsWith("-") || !p.toLowerCase().endsWith(".png"))) throw new VisionError("failed", "vision-detect: аргументы — только пути PNG");
  const timeoutMs = o.timeoutMs ?? 30_000 + 2_000 * pngs.length;
  const ac = new AbortController();
  let why: "timeout" | "aborted" | undefined;
  const timer = setTimeout(() => {
    why ??= "timeout";
    ac.abort();
  }, timeoutMs);
  const onAbort = () => {
    why ??= "aborted";
    ac.abort();
  };
  o.signal.addEventListener("abort", onAbort, { once: true });
  try {
    const env: NodeJS.ProcessEnv = { LANG: process.env.LANG ?? "en_US.UTF-8" };
    const r = await (o.spawn ?? spawnTracked)(o.run.root, { runId: o.run.runId, attempt: o.run.attempt }, bin, pngs, {
      cwd: dirname(pngs[0]!), env, signal: ac.signal, registry: o.run.registry, killGraceMs: 2000, maxOutputChars: 16 * 1024 * 1024,
    });
    if (r.orphaned) throw new VisionError("orphaned", "группа vision-detect не исчезла после SIGKILL; запись оставлена в реестре (stale_process)");
    if (why === "timeout") throw new VisionError("timeout", `vision-detect не уложился в ${timeoutMs} мс`);
    if (why === "aborted") throw new VisionError("aborted", "vision-detect отменён");
    if (r.code !== 0) throw new VisionError("failed", `vision-detect: код ${r.code ?? r.signal}: ${r.stderr.trim().slice(-1000)}`);
    let json: unknown;
    try {
      json = JSON.parse(r.stdout);
    } catch {
      throw new VisionError("failed", `vision-detect: вывод не JSON: ${r.stdout.trim().slice(0, 300)}`);
    }
    let frames: VisionFrame[];
    try {
      frames = parseVisionOutput(json);
    } catch (e) {
      throw new VisionError("failed", `vision-detect: вывод не по схеме: ${(e as Error).message.slice(0, 500)}`);
    }
    if (frames.length !== pngs.length || frames.some((f, k) => f.path !== pngs[k])) {
      throw new VisionError("failed", `vision-detect: в выводе ${frames.length} кадров вместо ${pngs.length} или чужие пути`);
    }
    return frames;
  } finally {
    clearTimeout(timer);
    o.signal.removeEventListener("abort", onAbort);
  }
}
