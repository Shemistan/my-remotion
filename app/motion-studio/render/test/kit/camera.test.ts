import { describe, expect, it } from "vitest";
import { PARALLAX_OVERSCAN, cameraAt, parallaxTransform } from "../../src/motion-kit/choreo/camera.js";
import { resolveStyle } from "../../src/motion-kit/style/resolve.js";

const st = resolveStyle({ preset: "dark-premium", intensity: "balanced" });
const zoom = { ...st, camera: { allow_zoom: true, max_scale: 1.15, parallax: true } };
const keys = [{ frame: 0, scale: 1, x: 0, y: 0 }, { frame: 90, scale: 1.3, x: 0, y: 0 }];

describe("cameraAt", () => {
  it("scale ограничен camera.max_scale (бриф)", () => {
    expect(cameraAt(90, keys, zoom).scale).toBe(1.15);
  });

  it("до первого ключа и после последнего — держит крайние значения", () => {
    expect(cameraAt(-10, keys, zoom)).toEqual({ scale: 1, x: 0, y: 0 });
    expect(cameraAt(500, keys, zoom).scale).toBe(1.15);
  });

  it("плавно и монотонно между ключами, без перелёта", () => {
    const k = [{ frame: 0, scale: 1, x: 0, y: 0 }, { frame: 100, scale: 1.1, x: 40, y: -20 }];
    let prev = cameraAt(0, k, zoom);
    for (let f = 1; f <= 100; f++) {
      const c = cameraAt(f, k, zoom);
      expect(c.scale).toBeGreaterThanOrEqual(prev.scale);
      expect(c.x).toBeGreaterThanOrEqual(prev.x);
      expect(c.scale).toBeLessThanOrEqual(1.1 + 1e-9);
      expect(c.x).toBeLessThanOrEqual(40 + 1e-9);
      prev = c;
    }
    expect(cameraAt(100, k, zoom)).toEqual({ scale: 1.1, x: 40, y: -20 });
  });

  it("allow_zoom = false ⇒ scale = 1, панорама остаётся", () => {
    const flat = { ...st, camera: { allow_zoom: false, max_scale: 1.2, parallax: false } };
    const k = [{ frame: 0, scale: 1, x: 0, y: 0 }, { frame: 30, scale: 1.2, x: 60, y: 0 }];
    expect(cameraAt(30, k, flat)).toEqual({ scale: 1, x: 60, y: 0 });
  });

  it("без ключей — покой; ключи не по порядку сортируются", () => {
    expect(cameraAt(10, [], zoom)).toEqual({ scale: 1, x: 0, y: 0 });
    const rev = [keys[1]!, keys[0]!];
    expect(cameraAt(45, rev, zoom)).toEqual(cameraAt(45, keys, zoom));
  });
});

describe("parallaxTransform", () => {
  it("слой 0 повторяет камеру; слой 2 двигается в 1.3 раза сильнее", () => {
    const cam = { scale: 1.1, x: 20, y: 0 };
    expect(parallaxTransform(cam, 0)).toEqual({ scale: 1, x: 0, y: 0 });
    const l2 = parallaxTransform(cam, 2);
    // итог слоя относительно кадра: масштаб 1 + 0.1·1.3
    expect(cam.scale * l2.scale).toBeCloseTo(1.13, 10);
  });
});

describe("cameraAt с размером кадра: камера не открывает края сцены (Task 17)", () => {
  const size = { width: 1920, height: 1080 };
  const mx = 1920 * zoom.grid.safe_area.x;
  const my = 1080 * zoom.grid.safe_area.y;
  // реальный дефект Task 13: наезд с панорамой вправо и вверх открыл полосы сверху и справа
  const pan = [{ frame: 0, scale: 1, x: 0, y: 0 }, { frame: 60, scale: 1.08, x: 420, y: -200 }];

  it("без масштаба панорамы нет: сдвиг открыл бы край фона", () => {
    const flat = [{ frame: 0, scale: 1, x: 0, y: 0 }, { frame: 30, scale: 1, x: 300, y: -120 }];
    expect(cameraAt(30, flat, zoom, size)).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it("на каждом кадре слой во весь кадр покрывает кадр, а край safe area — не ближе половины поля к краю кадра", () => {
    for (let f = 0; f <= 70; f++) {
      const c = cameraAt(f, pan, zoom, size);
      // точка слоя p (от центра) попадает в s·(p − x): края слоя ±W/2 не заходят внутрь кадра
      expect(c.scale * (960 - Math.abs(c.x)), `кадр ${f}, x`).toBeGreaterThanOrEqual(960 - 1e-6);
      expect(c.scale * (540 - Math.abs(c.y)), `кадр ${f}, y`).toBeGreaterThanOrEqual(540 - 1e-6);
      // край safe area остаётся внутри кадра хотя бы на половину поля (заголовок у края не режется)
      expect(c.scale * (960 - mx + Math.abs(c.x)), `кадр ${f}, safe x`).toBeLessThanOrEqual(960 - mx / 2 + 1e-6);
      expect(c.scale * (540 - my + Math.abs(c.y)), `кадр ${f}, safe y`).toBeLessThanOrEqual(540 - my / 2 + 1e-6);
    }
    const end = cameraAt(60, pan, zoom, size);
    expect(end.scale).toBeCloseTo(Math.min(1.08, (960 - mx / 2) / (960 - mx), (540 - my / 2) / (540 - my)), 9);
    expect(end.x).toBeGreaterThanOrEqual(0);
    expect(end.y).toBeLessThanOrEqual(0);
  });

  it("наезд не больше, чем позволяет safe area: край зоны не ближе половины поля к краю кадра", () => {
    // поля 5 %: (960 − 48) / (960 − 96) ≈ 1.0556 — меньше max_scale 1.15
    const narrow = { ...zoom, grid: { ...zoom.grid, safe_area: { x: 0.05, y: 0.05 } } };
    const c = cameraAt(60, [{ frame: 0, scale: 1, x: 0, y: 0 }, { frame: 60, scale: 1.15, x: 0, y: 0 }], narrow, size);
    expect(c.scale).toBeCloseTo((960 - 48) / (960 - 96), 6);
    // без размера кадра — прежний предел max_scale
    expect(cameraAt(60, [{ frame: 60, scale: 1.15, x: 0, y: 0 }], narrow).scale).toBe(1.15);
  });

  it("allow_zoom = false: только покой — панорама без запаса открыла бы край", () => {
    const flat = { ...st, camera: { allow_zoom: false, max_scale: 1.2, parallax: false } };
    expect(cameraAt(60, pan, flat, size)).toEqual({ scale: 1, x: 0, y: 0 });
  });
});

describe("parallaxTransform с размером кадра: слои > 0 не открывают края (overscan)", () => {
  const size = { width: 1920, height: 1080 };
  const pan = [{ frame: 0, scale: 1, x: 0, y: 0 }, { frame: 60, scale: 1.08, x: 420, y: -200 }];
  // слой во весь кадр: точка q (от центра) → s·(r·q + t − x); края ±half не заходят в кадр
  const covers = (cam: { scale: number; x: number; y: number }, l: { scale: number; x: number; y: number }, half: number, axis: "x" | "y") => {
    const at = (q: number) => cam.scale * (l.scale * q + l[axis] - cam[axis]);
    return Math.min(-at(-half), at(half)) - half;
  };

  it("на каждом кадре наезда с панорамой слои 0–2 покрывают кадр", () => {
    for (let f = 0; f <= 70; f++) {
      const c = cameraAt(f, pan, zoom, size);
      for (const layer of [0, 1, 2]) {
        const l = parallaxTransform(c, layer, size);
        // слои > 0 — с запасом PARALLAX_OVERSCAN px: край не мерцает сглаживанием
        const need = layer > 0 ? PARALLAX_OVERSCAN * Math.min(1, (c.scale - 1) / 0.01) : 0;
        expect(covers(c, l, 960, "x"), `кадр ${f}, слой ${layer}, x`).toBeGreaterThanOrEqual(need - 1e-6);
        expect(covers(c, l, 540, "y"), `кадр ${f}, слой ${layer}, y`).toBeGreaterThanOrEqual(need - 1e-6);
      }
    }
  });

  it("без размера — прежняя формула (без overscan); слой 0 — всегда как камера", () => {
    // панорама у предела запаса наезда (panLimit без ограничения safe area)
    const c = { scale: 1.08, x: 960 * (1 - 1 / 1.08), y: 0 };
    const raw = parallaxTransform(c, 2);
    // дефект ревью: без запаса край слоя 2 открывается на 1–3 px
    expect(covers(c, raw, 960, "x")).toBeLessThan(-0.5);
    expect(parallaxTransform(c, 0, size)).toEqual({ scale: 1, x: 0, y: 0 });
    // в покое камеры слой — ровно кадр: запаса нет, сцены без камеры не меняются
    expect(parallaxTransform({ scale: 1, x: 0, y: 0 }, 2, size)).toEqual({ scale: 1, x: 0, y: 0 });
    // запас — только масштаб: смещение слоя по-прежнему сильнее камеры
    const l2 = parallaxTransform(c, 2, size);
    expect(l2.scale).toBeGreaterThan(raw.scale);
    expect(l2.scale - raw.scale).toBeLessThan(0.01);
  });
});
