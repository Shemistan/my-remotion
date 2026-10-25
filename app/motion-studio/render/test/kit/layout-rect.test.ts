// motion-kit 0.5.9 (Task 35′, Р-V5): `<LayoutRect rect?>` — графика видеосцены только в
// прямоугольнике `props.layout.rect` (доли кадра); без поля — весь кадр, вид прежний.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("remotion", async (orig) => ({ ...(await orig<typeof import("remotion")>()), useVideoConfig: () => ({ width: 1920, height: 1080, fps: 30, durationInFrames: 90 }) }));

const { LayoutRect, layoutRectPx, useLayoutRect } = await import("../../src/motion-kit/components/LayoutRect.js");
const { MOTION_KIT_VERSION } = await import("../../src/motion-kit/version.js");

describe("layoutRectPx", () => {
  it("доли кадра → px, края на целых пикселях без зазора; без rect — весь кадр", () => {
    expect(layoutRectPx({ x: 0.5, y: 0, w: 0.5, h: 1 }, 1920, 1080)).toEqual({ left: 960, top: 0, width: 960, height: 1080 });
    expect(layoutRectPx({ x: 0.04, y: 0.7, w: 0.92, h: 0.24 }, 1920, 1080)).toEqual({ left: 77, top: 756, width: 1766, height: 259 });
    expect(layoutRectPx(undefined, 1920, 1080)).toEqual({ left: 0, top: 0, width: 1920, height: 1080 });
    expect(layoutRectPx({ x: 0.66, y: 0.04, w: 0.3, h: 0.3 }, 1080, 1920)).toEqual({ left: 713, top: 77, width: 324, height: 576 });
  });
});

describe("<LayoutRect> и useLayoutRect()", () => {
  function Probe() {
    const r = useLayoutRect();
    return createElement("i", { "data-rect": `${r.left},${r.top},${r.width},${r.height}` });
  }

  it("абсолютный контейнер по rect; useLayoutRect внутри — размер контейнера в его координатах (left/top 0)", () => {
    const html = renderToStaticMarkup(createElement(LayoutRect, { rect: { x: 0.5, y: 0, w: 0.5, h: 1 } }, createElement(Probe)));
    expect(html).toMatch(/position:absolute;left:960px;top:0;width:960px;height:1080px/);
    expect(html).toContain('data-ms-layout-rect="true"');
    expect(html).toContain('data-rect="0,0,960,1080"');
    const lower = renderToStaticMarkup(createElement(LayoutRect, { rect: { x: 0.04, y: 0.7, w: 0.92, h: 0.24 } }, createElement(Probe)));
    expect(lower).toContain('data-rect="0,0,1766,259"');
  });

  it("без rect и вне LayoutRect — весь кадр", () => {
    expect(renderToStaticMarkup(createElement(LayoutRect, {}, createElement(Probe)))).toContain('data-rect="0,0,1920,1080"');
    expect(renderToStaticMarkup(createElement(Probe))).toContain('data-rect="0,0,1920,1080"');
  });

  it("версия API kit — 0.5.9", () => {
    expect(MOTION_KIT_VERSION).toBe("0.5.9");
  });
});
