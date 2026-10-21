// Синтетические PNG 192×108 (pngjs) и спецификации для юнит-тестов QA. Пишут только в tmp/.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Beat, type Element, type MotionSpec, type Settings, defaultSettings } from "@ms/contracts";
import { type RenderResult, resolveStyle } from "@ms/render";
import { PNG } from "pngjs";

const REPO_TMP = fileURLToPath(new URL("../../../../../tmp/", import.meta.url));

export async function makeTmp(): Promise<string> {
  await mkdir(REPO_TMP, { recursive: true });
  return mkdtemp(join(REPO_TMP, "ms-qa-test-"));
}
export const removeTmp = (dir: string) => rm(dir, { recursive: true, force: true });

export const W = 192;
export const H = 108;

type RGB = [number, number, number];
const hex = (c: string): RGB => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) as RGB;

/** Кадр в памяти: RGBA, рисуется прямоугольниками. */
export class Canvas {
  readonly data: Uint8Array;
  constructor(readonly width = W, readonly height = H, bg = "#101010") {
    this.data = new Uint8Array(width * height * 4);
    this.rect(0, 0, width, height, bg);
  }
  rect(x: number, y: number, w: number, h: number, color: string): this {
    const [r, g, b] = hex(color);
    for (let yy = Math.max(0, y); yy < Math.min(this.height, y + h); yy++) {
      for (let xx = Math.max(0, x); xx < Math.min(this.width, x + w); xx++) {
        const i = (yy * this.width + xx) * 4;
        this.data[i] = r;
        this.data[i + 1] = g;
        this.data[i + 2] = b;
        this.data[i + 3] = 255;
      }
    }
    return this;
  }
  png(colorType: 2 | 6 = 6): Buffer {
    const p = new PNG({ width: this.width, height: this.height, colorType, inputColorType: 6, inputHasAlpha: true });
    p.data = Buffer.from(this.data);
    return PNG.sync.write(p, { colorType, inputColorType: 6, inputHasAlpha: true });
  }
}

export const solid = (color: string) => new Canvas(W, H, color);
/** Карточка в центре кадра — «нормальный» кадр без дефектов. */
export const card = (dx = 0, color = "#e0e0e0") => new Canvas().rect(70 + dx, 40, 50, 28, color);

export function settings(over: Partial<Settings> = {}): Settings {
  return { ...defaultSettings(), width: W, height: H, safe_area: { x: 0.05, y: 0.05 }, ...over };
}

export const style = (over: Parameters<typeof resolveStyle>[0]["palette_overrides"] = {}) =>
  resolveStyle({ preset: "dark-premium", intensity: "balanced", palette_overrides: over });

export function el(id: string, over: Partial<Element> = {}): Element {
  return { id, kind: "text", role: "текст", entrance: "rise", content: {}, ...over };
}

export function beat(id: string, start: number, end: number, ids: string[], action = `${id}-in`): Beat {
  return { id, start_frame: start, end_frame: end, action, description: "", element_ids: ids };
}

export function spec(over: Partial<MotionSpec> & Pick<MotionSpec, "beats">): MotionSpec {
  const ids = [...new Set(over.beats.flatMap((b) => b.element_ids))];
  return {
    title: "тест",
    purpose: "тест",
    duration_frames: Math.max(...over.beats.map((b) => b.end_frame)),
    fps: { num: 30, den: 1 },
    style_preset: "dark-premium",
    elements: ids.map((id) => el(id)),
    ...over,
  };
}

export function renderResult(over: Partial<RenderResult> = {}): RenderResult {
  return { ok: true, stills: [], previewPath: "/x/preview.mp4", browserLogs: [], ...over };
}

/**
 * Вход programmaticChecks: кадры пишутся в tmp; `beats` битов подряд по 30 кадров,
 * i-й кадр — 25-й кадр i-го бита, после входа (enter_frames 24), если `at` не задан.
 */
export async function withFrames(
  tmp: string,
  canvases: Canvas[],
  o: { beats?: number; at?: number[]; logs?: string[]; previewBytes?: number; style?: ReturnType<typeof style>; spec?: MotionSpec } = {},
) {
  const n = o.beats ?? canvases.length;
  const sp = o.spec ?? spec({ beats: Array.from({ length: n }, (_, i) => beat(`b${i}`, i * 30, i * 30 + 30, ["a"])) });
  const at = o.at ?? canvases.map((_, i) => Math.min(sp.duration_frames - 1, i * 30 + 25));
  const frames: { frame: number; path: string }[] = [];
  for (const [i, c] of canvases.entries()) {
    const path = join(tmp, `f${i}-${at[i]}.png`);
    await writeFile(path, c.png());
    frames.push({ frame: at[i]!, path });
  }
  return {
    frames,
    spec: sp,
    settings: settings(),
    style: o.style ?? style(),
    render: renderResult({ browserLogs: o.logs ?? [] }),
    previewBytes: o.previewBytes ?? 1000,
  };
}
