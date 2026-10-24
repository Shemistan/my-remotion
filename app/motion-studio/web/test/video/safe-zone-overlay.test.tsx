// SafeZoneOverlay (Task 33): рамки лица и рук и свободные зоны с процентом — точно в видимой
// области кадра (letterbox учитывается); `llm_only` — предупреждение; зона сцены плана.
import { render, screen } from "@testing-library/react";
import { ZONE_RECTS } from "@ms/contracts";
import { expect, it } from "vitest";
import { SafeZoneOverlay } from "../../src/components/video/SafeZoneOverlay.js";
import { t } from "../../src/i18n/index.js";
import { FACE, shot } from "./plan-fixtures.js";

const px = (el: HTMLElement) => ({ left: parseFloat(el.style.left), top: parseFloat(el.style.top), width: parseFloat(el.style.width), height: parseFloat(el.style.height) });

it("лицо, руки и свободные зоны — в пикселях видимой области 16:9 внутри контейнера 1280×1000 (полосы по 140 px)", () => {
  render(<SafeZoneOverlay aspect={16 / 9} size={{ width: 1280, height: 1000 }} shot={shot()} mode="vision" />);
  const face = px(screen.getByTestId("zone-face"));
  expect(face.left).toBeCloseTo(1280 * FACE.x, 6);
  expect(face.top).toBeCloseTo(140 + 720 * FACE.y, 6);
  expect(face.width).toBeCloseTo(1280 * FACE.w, 6);
  expect(face.height).toBeCloseTo(720 * FACE.h, 6);
  expect(screen.getByTestId("zone-face").textContent).toBe(t("analysis.zone.face"));
  expect(screen.getByTestId("zone-hands")).toBeTruthy();
  const right = screen.getByTestId("zone-free-right_third");
  expect(right.textContent).toBe(t("analysis.zone.free", { zone: t("zone.right_third"), pct: 42 }));
  expect(px(right).left).toBeCloseTo(1280 * ZONE_RECTS.right_third.x, 6);
  expect(screen.queryByText(t("analysis.llmOnly"))).toBeNull();
});

it("окно занятости под курсором: руки и свободные зоны окна вместо худшего случая шота", () => {
  const s = shot({
    windows: [{ start_us: 0, end_us: 4_000_000, occupied: [FACE], free_zones: [{ zone: "right_third", rect: ZONE_RECTS.right_third, free_ratio: 0.9 }] }],
  });
  render(<SafeZoneOverlay aspect={16 / 9} size={{ width: 1280, height: 720 }} shot={s} mode="vision" atUs={1_000_000} />);
  expect(screen.getByTestId("zone-free-right_third").textContent).toContain("90");
  expect(screen.queryByTestId("zone-hands")).toBeNull();
});

it("llm_only — предупреждение «зоны оценены без детектора»; зона сцены плана — с признаком проблемы", () => {
  render(<SafeZoneOverlay aspect={16 / 9} size={{ width: 640, height: 360 }} shot={shot()} mode="llm_only" plan={{ rect: ZONE_RECTS.right_third, label: "sp_001", bad: true }} />);
  expect(screen.getByText(t("analysis.llmOnly"))).toBeTruthy();
  const z = screen.getByTestId("zone-plan");
  expect(z.className).toContain("bad");
  expect(px(z).left).toBeCloseTo(640 * 0.66, 6);
  expect(screen.queryByTestId("zone-free-left_third")).toBeNull(); // в режиме плана свободные зоны не рисуются
});

it("ревью V4: подписи левой и нижней трети стоят в разных углах (не наезжают друг на друга)", () => {
  const free = (["left_third", "lower_third", "right_third", "top_band"] as const).map((zone) => ({ zone, rect: ZONE_RECTS[zone], free_ratio: 0.5 }));
  render(<SafeZoneOverlay aspect={16 / 9} size={{ width: 1280, height: 720 }} shot={shot({ free_zones: free })} mode="vision" />);
  const corner = (z: string) => screen.getByTestId(`zone-free-${z}`).querySelector(".zone-label")!.className;
  const all = ["left_third", "lower_third", "right_third", "top_band"].map(corner);
  expect(corner("left_third")).not.toBe(corner("lower_third"));
  expect(corner("right_third")).not.toBe(corner("lower_third"));
  for (const c of all) expect(c).toMatch(/at-(tl|tr|bl|br)/);
});
