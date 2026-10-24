// PlanTrack (Task 33): сцены на оси «после монтажа» — цвет по режиму, штриховка предложенных,
// красная рамка устаревших и с блокирующими проблемами, дорожки без наложений; пропуски — тонкие
// отметки с причиной; клик — выбор сцены.
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { PlanTrack } from "../../src/components/video/PlanTrack.js";
import { t } from "../../src/i18n/index.js";
import { item } from "./plan-fixtures.js";

const items = [
  item({ id: "sp_001", edited: { start_us: 0, end_us: 5_000_000 } }),
  item({ id: "sp_002", status: "accepted", composition_mode: "fullscreen", edited: { start_us: 4_000_000, end_us: 8_000_000 } }),
  item({ id: "sp_003", status: "stale", stale_reason: "timing_changed", composition_mode: "pip", edited: { start_us: 9_000_000, end_us: 10_000_000 } }),
  item({ id: "sp_004", status: "rejected", edited: { start_us: 8_000_000, end_us: 9_000_000 } }),
];

it("положение и дорожки, классы режима и статуса, проблема — красная рамка, выбор", () => {
  const onSelect = vi.fn();
  render(<PlanTrack items={items} issues={[{ item_id: "sp_002", code: "density", severity: "blocking", message: "много" }]} durationUs={10_000_000} skipped={[{ at_us: 2_000_000, reason: "мысль понятна без графики" }]} selected="sp_002" onSelect={onSelect} />);
  const a = screen.getByTestId("plan-item-sp_001");
  expect(a.style.left).toBe("0%");
  expect(a.style.width).toBe("50%");
  expect(a.dataset.lane).toBe("0");
  expect(a.className).toContain("mode-overlay");
  expect(a.className).toContain("status-proposed");
  const b = screen.getByTestId("plan-item-sp_002");
  expect(b.dataset.lane).toBe("1");
  expect(b.className).toContain("mode-fullscreen");
  expect(b.className).toContain("problem");
  expect(b.className).toContain("selected");
  expect(b.getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByTestId("plan-item-sp_003").className).toContain("problem"); // stale
  expect(screen.getByTestId("plan-item-sp_004").className).toContain("status-rejected");
  expect(screen.getByTestId("plan-item-sp_001").getAttribute("title")).toContain(t("plan.mode.overlay"));
  const mark = screen.getByTestId("plan-skip");
  expect(mark.style.left).toBe("20%");
  expect(mark.getAttribute("title")).toBe(t("plan.skipped", { reason: "мысль понятна без графики" }));
  fireEvent.click(a);
  expect(onSelect).toHaveBeenCalledWith("sp_001");
  // легенда режимов — подписи по-русски
  expect(screen.getByTestId("plan-legend").textContent).toContain(t("plan.mode.pip"));
});

it("сцен нет — пустая дорожка с подписью", () => {
  render(<PlanTrack items={[]} issues={[]} durationUs={10_000_000} skipped={[]} onSelect={vi.fn()} />);
  expect(screen.getByTestId("plan-track").textContent).toContain(t("plan.trackEmpty"));
});
