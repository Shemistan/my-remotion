// Геометрия дорожки плана и зон на кадре (Task 33): дорожки без наложений, прямоугольник в долях
// кадра → CSS внутри видимой области видео (letterbox `object-fit: contain`).
import { describe, expect, it } from "vitest";
import { trackLayout } from "../../src/video/plan-layout.js";
import { containBox, rectToCss } from "../../src/video/zone-geometry.js";

const it_ = (id: string, start_us: number, end_us: number) => ({ id, start_us, end_us });

describe("trackLayout", () => {
  it("пересекающиеся сцены — на разных дорожках, свободная дорожка переиспользуется", () => {
    expect(trackLayout([it_("a", 0, 5e6), it_("b", 4e6, 8e6), it_("c", 9e6, 10e6)], 10e6, 1000)).toEqual([
      { id: "a", left: 0, width: 500, lane: 0 }, { id: "b", left: 400, width: 400, lane: 1 }, { id: "c", left: 900, width: 100, lane: 0 }]);
  });

  it("порядок входа сохраняется, сортировка — только для дорожек; стык встык — одна дорожка; пустая длительность — нули", () => {
    expect(trackLayout([it_("b", 5e6, 6e6), it_("a", 0, 5e6)], 10e6, 100)).toEqual([
      { id: "b", left: 50, width: 10, lane: 0 }, { id: "a", left: 0, width: 50, lane: 0 }]);
    expect(trackLayout([it_("a", 0, 3e6), it_("b", 1e6, 2e6), it_("c", 1.5e6, 4e6)], 4e6, 400).map((x) => x.lane)).toEqual([0, 1, 2]);
    expect(trackLayout([it_("a", 0, 1)], 0, 100)).toEqual([{ id: "a", left: 0, width: 0, lane: 0 }]);
  });
});

describe("zone-geometry", () => {
  it("rectToCss: доли кадра → пиксели видимой области видео", () => {
    expect(rectToCss({ x: 0.66, y: 0.08, w: 0.3, h: 0.84 }, { left: 0, top: 0, width: 1280, height: 720 })).toEqual({ left: 844.8, top: 57.6, width: 384, height: 604.8 });
    expect(rectToCss({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 }, { left: 10, top: 140, width: 1280, height: 720 })).toEqual({ left: 650, top: 500, width: 640, height: 360 });
  });

  it("containBox: видео 16:9 в высоком контейнере — полосы сверху и снизу; в широком — по бокам; вертикальное видео", () => {
    expect(containBox({ width: 1280, height: 1000 }, 16 / 9)).toEqual({ left: 0, top: 140, width: 1280, height: 720 });
    expect(containBox({ width: 1000, height: 360 }, 16 / 9)).toEqual({ left: 180, top: 0, width: 640, height: 360 });
    expect(containBox({ width: 600, height: 400 }, 9 / 16)).toEqual({ left: 187.5, top: 0, width: 225, height: 400 });
    expect(containBox({ width: 0, height: 0 }, 16 / 9)).toEqual({ left: 0, top: 0, width: 0, height: 0 });
  });
});
