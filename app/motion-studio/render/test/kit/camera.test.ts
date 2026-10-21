import { describe, expect, it } from "vitest";
import { cameraAt, parallaxTransform } from "../../src/motion-kit/choreo/camera.js";
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
